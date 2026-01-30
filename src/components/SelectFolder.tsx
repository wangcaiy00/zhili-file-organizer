import { useState } from 'react';
import { FolderIcon, DownloadIcon, DesktopIcon, PhotoIcon, DocumentIcon, ChevronRightIcon } from './Icons';
import { useElectron } from '../hooks/useElectron';

interface SelectFolderProps {
  onSelect: (folder: string) => void;
}

interface QuickFolder {
  id: string;
  name: string;
  path: string;
  icon: React.ReactNode;
  description: string;
}

export function SelectFolder({ onSelect }: SelectFolderProps) {
  const [customPath, setCustomPath] = useState('');
  const { isDesktop, selectFolder, getQuickFolders } = useElectron();

  // 获取快捷文件夹列表
  const getQuickFoldersList = (): QuickFolder[] => {
    if (isDesktop) {
      const folders = getQuickFolders();
      return folders.map(f => {
        let icon = <FolderIcon className="w-6 h-6" />;
        let description = '';
        
        switch(f.type) {
          case 'downloads':
            icon = <DownloadIcon className="w-6 h-6" />;
            description = '浏览器下载的文件';
            break;
          case 'desktop':
            icon = <DesktopIcon className="w-6 h-6" />;
            description = '桌面上的文件';
            break;
          case 'documents':
            icon = <DocumentIcon className="w-6 h-6" />;
            description = '文档和办公文件';
            break;
          case 'pictures':
            icon = <PhotoIcon className="w-6 h-6" />;
            description = '图片和照片';
            break;
        }
        
        return {
          id: f.type,
          name: f.name,
          path: f.path,
          icon,
          description,
        };
      });
    }
    
    // Web演示模式使用模拟路径
    return [
      { id: 'downloads', name: '下载', path: 'C:\\Users\\Demo\\Downloads', icon: <DownloadIcon className="w-6 h-6" />, description: '浏览器下载的文件' },
      { id: 'desktop', name: '桌面', path: 'C:\\Users\\Demo\\Desktop', icon: <DesktopIcon className="w-6 h-6" />, description: '桌面上的文件' },
      { id: 'documents', name: '文档', path: 'C:\\Users\\Demo\\Documents', icon: <DocumentIcon className="w-6 h-6" />, description: '文档和办公文件' },
      { id: 'pictures', name: '图片', path: 'C:\\Users\\Demo\\Pictures', icon: <PhotoIcon className="w-6 h-6" />, description: '图片和照片' },
    ];
  };

  const quickFolders = getQuickFoldersList();

  const handleQuickSelect = (folder: QuickFolder) => {
    onSelect(folder.path);
  };

  const handleBrowse = async () => {
    if (isDesktop && selectFolder) {
      const result = await selectFolder();
      if (result) {
        onSelect(result);
      }
    } else {
      // Web模式模拟选择
      const mockPath = 'C:\\Users\\Demo\\CustomFolder';
      setCustomPath(mockPath);
    }
  };

  const handleCustomPathSubmit = () => {
    if (customPath.trim()) {
      onSelect(customPath.trim());
    }
  };

  return (
    <div className="content-container flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl animate-fadeIn">
        {/* 标题 */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-gray-800 mb-3">
            选择要整理的文件夹
          </h1>
          <p className="text-gray-500">
            智理会扫描文件夹内容，生成整理计划供您预览确认
          </p>
        </div>

        {/* 快捷文件夹 */}
        <div className="card card-lg p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
            快捷选择
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {quickFolders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleQuickSelect(folder)}
                className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  {folder.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 group-hover:text-blue-700 transition-colors">
                    {folder.name}
                  </div>
                  <div className="text-sm text-gray-400 truncate">
                    {folder.description}
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* 自定义路径 */}
        <div className="card card-lg p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
            自定义路径
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="输入或粘贴文件夹路径..."
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleCustomPathSubmit()}
            />
            <button
              onClick={handleBrowse}
              className="btn btn-secondary px-5"
            >
              <FolderIcon className="w-5 h-5" />
              浏览
            </button>
            <button
              onClick={handleCustomPathSubmit}
              disabled={!customPath.trim()}
              className="btn btn-primary px-6"
            >
              确定
            </button>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="mt-8 flex items-center justify-center gap-8 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            本地处理，不上传数据
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            先预览再执行
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            支持一键撤销
          </div>
        </div>
      </div>
    </div>
  );
}
