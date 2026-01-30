import { FileItem, CategoryType, OrganizePlan, DuplicateGroup, NamingRules } from '../types';

const mockFileNames: { name: string; category: CategoryType; content?: string }[] = [
  { name: 'IMG_20231215_143022.jpg', category: '截图', content: '微信聊天截图' },
  { name: 'Screenshot_2024-01-08.png', category: '截图', content: '网页截图' },
  { name: '租房合同2024.pdf', category: '合同', content: '房屋租赁合同 - 甲方：张三，乙方：李四' },
  { name: '劳动合同-王小明.docx', category: '合同', content: '劳动合同 - 北京某科技有限公司' },
  { name: '电子发票_滴滴出行_20240108.pdf', category: '发票', content: '滴滴出行电子发票 - 金额：45.00元' },
  { name: 'fapiao_jd_202401.pdf', category: '发票', content: '京东电子发票 - 金额：299.00元' },
  { name: '小米手机说明书.pdf', category: '说明书', content: '小米14 使用说明书' },
  { name: 'manual_airpods.pdf', category: '说明书', content: 'AirPods Pro 用户手册' },
  { name: 'DSC_0892.jpg', category: '图片', content: '风景照片' },
  { name: 'photo_2024_vacation.jpg', category: '图片', content: '度假照片' },
  { name: 'wedding_video_final.mp4', category: '视频', content: '婚礼视频' },
  { name: 'screen_recording_2024.mov', category: '视频', content: '屏幕录制' },
  { name: '年度工作总结.docx', category: '文档', content: '2023年度工作总结报告' },
  { name: 'meeting_notes_0115.txt', category: '文档', content: '会议记录' },
  { name: 'project_backup.zip', category: '压缩包' },
  { name: 'photos_2023.rar', category: '压缩包' },
  { name: 'index.js', category: '代码' },
  { name: 'styles.css', category: '代码' },
  { name: 'random_file.xyz', category: '其他' },
  { name: 'download(1).jpg', category: '图片', content: '下载的图片' },
  { name: 'download(2).jpg', category: '图片', content: '下载的图片（重复）' },
  { name: '未命名文档.docx', category: '文档', content: '草稿文档' },
  { name: 'WeChat_Image_20240112.jpg', category: '截图', content: '微信图片' },
  { name: '音乐.mp3', category: '音频' },
  { name: 'podcast_episode_42.mp3', category: '音频' },
];

function generateHash(): string {
  return Math.random().toString(36).substring(2, 15);
}

function generateSmartName(file: { name: string; category: CategoryType; content?: string }, date: Date): string {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const ext = file.name.split('.').pop();
  
  switch (file.category) {
    case '合同':
      if (file.content?.includes('租赁')) return `${dateStr}-租房合同-房屋租赁.${ext}`;
      if (file.content?.includes('劳动')) return `${dateStr}-劳动合同-北京某科技.${ext}`;
      return `${dateStr}-合同-${file.name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').substring(0, 10)}.${ext}`;
    case '发票':
      if (file.content?.includes('滴滴')) return `${dateStr}-发票-滴滴出行-45元.${ext}`;
      if (file.content?.includes('京东')) return `${dateStr}-发票-京东-299元.${ext}`;
      return `${dateStr}-发票-电子发票.${ext}`;
    case '截图':
      return `${dateStr}-截图-${Math.random().toString(36).substring(2, 6)}.${ext}`;
    case '说明书':
      if (file.content?.includes('小米')) return `${dateStr}-说明书-小米14.${ext}`;
      if (file.content?.includes('AirPods')) return `${dateStr}-说明书-AirPods.${ext}`;
      return `${dateStr}-说明书.${ext}`;
    case '图片':
      return `${dateStr}-照片-${Math.random().toString(36).substring(2, 6)}.${ext}`;
    case '视频':
      if (file.content?.includes('婚礼')) return `${dateStr}-视频-婚礼记录.${ext}`;
      return `${dateStr}-视频-${Math.random().toString(36).substring(2, 6)}.${ext}`;
    default:
      return file.name;
  }
}

export function generateMockFiles(): FileItem[] {
  const files: FileItem[] = [];
  const duplicateHash = generateHash();
  
  mockFileNames.forEach((mock, index) => {
    const createdAt = new Date(2024, 0, Math.floor(Math.random() * 28) + 1);
    const modifiedAt = new Date(createdAt.getTime() + Math.random() * 86400000 * 7);
    
    const isDuplicate = mock.name.includes('download(2)');
    const hash = isDuplicate ? duplicateHash : (mock.name.includes('download(1)') ? duplicateHash : generateHash());
    
    files.push({
      id: `file-${index}`,
      name: mock.name,
      originalName: mock.name,
      newName: generateSmartName(mock, modifiedAt),
      type: mock.name.split('.').pop() || 'unknown',
      size: Math.floor(Math.random() * 10000000) + 10000,
      category: mock.category,
      path: `/Downloads/${mock.name}`,
      hash,
      duplicateOf: isDuplicate ? 'file-19' : undefined,
      content: mock.content,
      createdAt,
      modifiedAt,
      selected: true,
      keepInDuplicate: !isDuplicate,
    });
  });
  
  return files;
}

export function generateOrganizePlan(files: FileItem[]): OrganizePlan {
  const categorizedFiles: { [key in CategoryType]?: FileItem[] } = {};
  
  files.forEach(file => {
    if (!categorizedFiles[file.category]) {
      categorizedFiles[file.category] = [];
    }
    categorizedFiles[file.category]!.push(file);
  });
  
  const hashMap: { [key: string]: FileItem[] } = {};
  files.forEach(file => {
    const hash = file.hash || 'no-hash';
    if (!hashMap[hash]) {
      hashMap[hash] = [];
    }
    hashMap[hash].push(file);
  });
  
  const duplicates: DuplicateGroup[] = Object.entries(hashMap)
    .filter(([, files]) => files.length > 1)
    .map(([hash, files]) => ({ hash, files, keepIndex: 0 }));
  
  const filesOnly = files.filter(f => !f.isDirectory);
  const foldersOnly = files.filter(f => f.isDirectory);
  const shortcuts = files.filter(f => f.isShortcut);
  const needsRename = files.filter(f => f.needsRename);
  const needsMove = files.filter(f => f.needsMove);
  
  const stats = {
    totalFiles: filesOnly.length,
    totalFolders: foldersOnly.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    categorizedCount: Object.fromEntries(
      Object.entries(categorizedFiles).map(([k, v]) => [k, v?.length || 0])
    ) as { [key in CategoryType]?: number },
    duplicateCount: duplicates.reduce((sum, g) => sum + g.files.length - 1, 0),
    renamedCount: needsRename.length,
    movedCount: needsMove.length,
    shortcutCount: shortcuts.length,
  };

  const namingRules: NamingRules = {
    addDatePrefix: true,
    extractTheme: true,
    keepOriginalName: false,
    dateFormat: 'YYYYMMDD',
  };

  // 确定哪些分类需要创建目录（>=3个文件）
  const categoriesNeedingFolders = Object.entries(categorizedFiles)
    .filter(([cat, items]) => 
      items && items.length >= 3 && 
      cat !== '快捷方式' && cat !== '其他' && cat !== '文件夹'
    )
    .map(([cat]) => cat);
  
  return {
    files,
    categories: categorizedFiles,
    duplicates,
    stats,
    namingRules,
    categoriesNeedingFolders,
  };
}
