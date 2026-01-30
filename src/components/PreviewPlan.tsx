import { useState, useCallback } from 'react';
import { cn } from '../utils/cn';
import { OrganizePlan, CategoryType, FileItem, NamingRules } from '../types';
import { getCategoryIcon, getCategoryColor, ArrowRightIcon, CopyIcon, TrashIcon, CogIcon, CheckIcon, FolderIcon, FolderOpenIcon, PencilIcon, XMarkIcon } from './Icons';

interface PreviewPlanProps {
  plan: OrganizePlan;
  onExecute: (plan: OrganizePlan) => void;
  onBack: () => void;
  onUpdatePlan: (plan: OrganizePlan) => void;
}

type TabType = 'categories' | 'rename' | 'duplicates' | 'settings';

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const categoryOrder: CategoryType[] = ['合同', '发票', '截图', '说明书', '图片', '视频', '音频', '文档', '压缩包', '代码', '程序', '快捷方式', '文件夹', '下载', '备份', '其他'];

export function PreviewPlan({ plan, onExecute, onBack, onUpdatePlan }: PreviewPlanProps) {
  const [activeTab, setActiveTab] = useState<TabType>('categories');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // 只显示需要重命名的文件（排除文件夹和快捷方式）
  const filesToRename = plan.files.filter(f => f.needsRename && !f.isDirectory && !f.isShortcut);
  // 需要移动的文件
  const filesToMove = plan.files.filter(f => f.needsMove && !f.isDirectory && !f.isShortcut);
  
  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'categories', label: '分类详情', count: Object.keys(plan.categories).length },
    { key: 'rename', label: '需整理', count: filesToRename.length + filesToMove.length },
    { key: 'duplicates', label: '重复文件', count: plan.stats.duplicateCount },
    { key: 'settings', label: '命名设置' },
  ];

  const toggleFileSelection = useCallback((fileId: string) => {
    const updatedFiles = plan.files.map(f => 
      f.id === fileId ? { ...f, selected: !f.selected } : f
    );
    const updatedPlan = { ...plan, files: updatedFiles };
    onUpdatePlan(updatedPlan);
  }, [plan, onUpdatePlan]);

  const startEditingFile = useCallback((file: FileItem) => {
    setEditingFileId(file.id);
    setEditingName(file.newName);
  }, []);

  const saveFileName = useCallback(() => {
    if (!editingFileId || !editingName.trim()) return;
    
    const updatedFiles = plan.files.map(f =>
      f.id === editingFileId ? { ...f, newName: editingName.trim() } : f
    );
    const updatedPlan = { ...plan, files: updatedFiles };
    onUpdatePlan(updatedPlan);
    setEditingFileId(null);
    setEditingName('');
  }, [editingFileId, editingName, plan, onUpdatePlan]);

  const cancelEditing = useCallback(() => {
    setEditingFileId(null);
    setEditingName('');
  }, []);

  const updateNamingRules = useCallback((rules: Partial<NamingRules>) => {
    const updatedPlan = {
      ...plan,
      namingRules: { ...plan.namingRules, ...rules }
    };
    onUpdatePlan(updatedPlan);
  }, [plan, onUpdatePlan]);

  const updateDuplicateKeep = useCallback((groupHash: string, keepIndex: number) => {
    const updatedDuplicates = plan.duplicates.map(g =>
      g.hash === groupHash ? { ...g, keepIndex } : g
    );
    const updatedPlan = { ...plan, duplicates: updatedDuplicates };
    onUpdatePlan(updatedPlan);
  }, [plan, onUpdatePlan]);

  const exportPlan = useCallback(() => {
    const exportData = {
      exportTime: new Date().toISOString(),
      summary: plan.stats,
      files: plan.files.map(f => ({
        original: f.originalName,
        new: f.newName,
        category: f.category,
        selected: f.selected
      })),
      duplicates: plan.duplicates.map(g => ({
        keepFile: g.files[g.keepIndex]?.name,
        deleteFiles: g.files.filter((_, i) => i !== g.keepIndex).map(f => f.name)
      })),
      namingRules: plan.namingRules
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `整理计划_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  const selectedFilesCount = plan.files.filter(f => f.selected).length;
  const folderCount = plan.files.filter(f => f.isDirectory).length;
  const fileCount = plan.files.filter(f => !f.isDirectory).length;

  return (
    <div className="content-container-full flex flex-col animate-fadeIn">
      {/* 横向布局 */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* 左侧：统计和目录结构 */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-5">
          {/* 统计卡片 */}
          <div className="card p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-4">整理概览</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-800">{fileCount}</p>
                <p className="text-xs text-gray-500 mt-1">文件</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">{folderCount}</p>
                <p className="text-xs text-gray-500 mt-1">文件夹</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{filesToMove.length}</p>
                <p className="text-xs text-gray-500 mt-1">待分类</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{filesToRename.length}</p>
                <p className="text-xs text-gray-500 mt-1">待重命名</p>
              </div>
            </div>
            {plan.stats.duplicateCount > 0 && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg text-center">
                <p className="text-lg font-bold text-red-600">{plan.stats.duplicateCount}</p>
                <p className="text-xs text-red-500 mt-1">重复文件可清理</p>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">占用空间: <span className="font-medium text-gray-700">{formatSize(plan.stats.totalSize)}</span></p>
            </div>
          </div>

          {/* 目录结构 */}
          <div className="card p-5 flex-1 overflow-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-4">目录结构预览</h3>
            <div className="text-sm">
              <div className="flex items-center gap-2 text-gray-700 mb-2">
                <FolderIcon className="w-5 h-5 text-blue-500" />
                <span className="font-medium">整理后/</span>
              </div>
              <div className="ml-4 space-y-1">
                {categoryOrder.map((category) => {
                  const count = plan.stats.categorizedCount[category] || 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setActiveTab('categories');
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 py-2 px-3 rounded-lg text-left transition-colors",
                        selectedCategory === category 
                          ? "bg-blue-50 text-blue-700" 
                          : "hover:bg-gray-50 text-gray-600"
                      )}
                    >
                      {getCategoryIcon(category)}
                      <span className="flex-1">{category}/</span>
                      <span className="text-gray-400 text-xs">{count}个</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：标签页内容 */}
        <div className="flex-1 card flex flex-col min-w-0">
          {/* 标签栏 */}
          <div className="flex border-b border-gray-100 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-3 text-sm font-medium transition-colors relative',
                  activeTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    'ml-2 px-1.5 py-0.5 text-xs rounded',
                    activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-auto p-5">
            {/* 分类详情 */}
            {activeTab === 'categories' && (
              <div className="h-full flex flex-col">
                {/* 分类筛选 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      selectedCategory === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    全部
                  </button>
                  {categoryOrder.map((category) => {
                    const count = plan.stats.categorizedCount[category] || 0;
                    if (count === 0) return null;
                    return (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          selectedCategory === category
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {category} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* 文件列表 */}
                <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-4 text-sm font-medium text-gray-500 flex-shrink-0">
                    <span className="w-6"></span>
                    <span className="w-7"></span>
                    <span className="flex-1">文件名</span>
                    <span className="w-24 text-right">大小</span>
                    <span className="w-20 text-center">分类</span>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {plan.files
                      .filter((f) => selectedCategory === null || f.category === selectedCategory)
                      .map((file) => (
                        <div key={file.id} className="table-row text-sm">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-6"
                          />
                          <span className="w-7">
                            {file.isDirectory ? (
                              <FolderOpenIcon className="w-5 h-5 text-amber-500" />
                            ) : (
                              getCategoryIcon(file.category)
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-gray-800 truncate">{file.newName}</p>
                              {file.isDirectory && (
                                <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">文件夹</span>
                              )}
                            </div>
                            {file.newName !== file.originalName && (
                              <p className="text-gray-400 truncate text-xs">原: {file.originalName}</p>
                            )}
                          </div>
                          <span className="w-24 text-right text-gray-500">
                            {file.isDirectory ? '-' : formatSize(file.size)}
                          </span>
                          <span className={cn('w-20 text-center text-xs px-2 py-1 rounded', getCategoryColor(file.category))}>
                            {file.category}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* 需整理（移动+重命名） */}
            {activeTab === 'rename' && (
              <div className="h-full flex flex-col">
                {(filesToMove.length === 0 && filesToRename.length === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <CheckIcon className="w-12 h-12 mb-3 opacity-50 text-green-500" />
                    <p className="text-base text-gray-600">文件夹已经很整洁！</p>
                    <p className="text-sm mt-1">没有需要整理的文件</p>
                  </div>
                ) : (
                  <>
                    {/* 需要移动的文件 */}
                    {filesToMove.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <FolderIcon className="w-5 h-5 text-blue-500" />
                          待分类整理 ({filesToMove.length} 个文件)
                          <span className="text-xs text-gray-400 font-normal ml-2">将移动到对应分类目录</span>
                        </h4>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-4 text-sm font-medium text-gray-500">
                            <span className="w-7"></span>
                            <span className="flex-1">文件名</span>
                            <span className="w-8 text-center">→</span>
                            <span className="w-24 text-center">目标目录</span>
                          </div>
                          <div className="max-h-48 overflow-auto">
                            {filesToMove.map((file) => (
                              <div key={file.id} className="table-row text-sm">
                                <span className="w-7">{getCategoryIcon(file.category)}</span>
                                <span className="flex-1 text-gray-700 truncate">{file.name}</span>
                                <ArrowRightIcon className="w-4 h-4 text-gray-300" />
                                <span className={cn('w-24 text-center text-xs px-2 py-1 rounded', getCategoryColor(file.category))}>
                                  {file.category}/
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 需要重命名的文件 */}
                    {filesToRename.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <PencilIcon className="w-5 h-5 text-purple-500" />
                          待重命名 ({filesToRename.length} 个文件)
                          <span className="text-xs text-gray-400 font-normal ml-2">点击编辑可修改</span>
                        </h4>
                        <div className="border border-gray-200 rounded-lg overflow-hidden flex-1">
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-4 text-sm font-medium text-gray-500">
                            <span className="w-7"></span>
                            <span className="flex-1">原文件名</span>
                            <span className="w-8 text-center">→</span>
                            <span className="flex-1">新文件名</span>
                            <span className="w-16"></span>
                          </div>
                          <div className="max-h-64 overflow-auto">
                            {filesToRename.map((file) => (
                              <div key={file.id} className="table-row text-sm">
                                <span className="w-7">{getCategoryIcon(file.category)}</span>
                                <span className="flex-1 text-gray-500 truncate">{file.originalName}</span>
                                <ArrowRightIcon className="w-4 h-4 text-gray-300" />
                                {editingFileId === file.id ? (
                                  <div className="flex-1 flex gap-2">
                                    <input
                                      type="text"
                                      value={editingName}
                                      onChange={(e) => setEditingName(e.target.value)}
                                      className="flex-1 text-sm"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveFileName();
                                        if (e.key === 'Escape') cancelEditing();
                                      }}
                                    />
                                    <button onClick={saveFileName} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                                      <CheckIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                                      <XMarkIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="flex-1 font-medium text-gray-800 truncate">{file.newName}</span>
                                    <button
                                      onClick={() => startEditingFile(file)}
                                      className="w-16 flex items-center justify-center gap-1 text-sm text-blue-600 hover:bg-blue-50 py-1 rounded"
                                    >
                                      <PencilIcon className="w-4 h-4" />
                                      编辑
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 重复文件 */}
            {activeTab === 'duplicates' && (
              <div className="h-full overflow-auto">
                {plan.duplicates.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <CopyIcon className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-base">没有发现重复文件</p>
                    <p className="text-sm mt-1">所有文件都是唯一的</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {plan.duplicates.map((group, groupIndex) => (
                      <div key={group.hash} className="border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-amber-100 border-b border-amber-200 flex items-center justify-between">
                          <span className="text-sm font-medium text-amber-800">
                            重复组 #{groupIndex + 1}
                          </span>
                          <span className="text-sm text-amber-600">
                            可释放 {formatSize(group.files.filter((_, i) => i !== group.keepIndex).reduce((sum, f) => sum + f.size, 0))}
                          </span>
                        </div>
                        <div className="divide-y divide-amber-200">
                          {group.files.map((file, fileIndex) => (
                            <div
                              key={file.id}
                              className={cn(
                                'flex items-center gap-3 px-4 py-2.5 text-sm',
                                fileIndex === group.keepIndex ? 'bg-white' : 'bg-amber-50'
                              )}
                            >
                              <input
                                type="radio"
                                name={`duplicate-${group.hash}`}
                                checked={fileIndex === group.keepIndex}
                                onChange={() => updateDuplicateKeep(group.hash, fileIndex)}
                              />
                              <span className={cn(
                                'text-xs px-2 py-1 rounded font-medium',
                                fileIndex === group.keepIndex ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              )}>
                                {fileIndex === group.keepIndex ? '保留' : '删除'}
                              </span>
                              <span className="flex-1 text-gray-700 truncate">{file.name}</span>
                              <span className="text-gray-400">{formatSize(file.size)}</span>
                              {fileIndex !== group.keepIndex && (
                                <TrashIcon className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 设置 */}
            {activeTab === 'settings' && (
              <div className="max-w-md">
                <h4 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                  <CogIcon className="w-5 h-5" />
                  命名规则设置
                </h4>
                <div className="space-y-4 bg-gray-50 p-5 rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.namingRules.addDatePrefix}
                      onChange={(e) => updateNamingRules({ addDatePrefix: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">添加日期前缀</span>
                      <p className="text-sm text-gray-400 mt-0.5">如：20240115-文件名.pdf</p>
                    </div>
                  </label>
                  
                  {plan.namingRules.addDatePrefix && (
                    <div className="ml-7 flex items-center gap-3">
                      <label className="text-sm text-gray-600">日期格式</label>
                      <select
                        value={plan.namingRules.dateFormat}
                        onChange={(e) => updateNamingRules({ dateFormat: e.target.value as NamingRules['dateFormat'] })}
                        className="text-sm"
                      >
                        <option value="YYYYMMDD">20240115</option>
                        <option value="YYYY-MM-DD">2024-01-15</option>
                        <option value="YYMMDD">240115</option>
                      </select>
                    </div>
                  )}
                  
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.namingRules.extractTheme}
                      onChange={(e) => updateNamingRules({ extractTheme: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">智能提取主题</span>
                      <p className="text-sm text-gray-400 mt-0.5">从文件内容中提取关键词命名</p>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.namingRules.keepOriginalName}
                      onChange={(e) => updateNamingRules({ keepOriginalName: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">保留原文件名</span>
                      <p className="text-sm text-gray-400 mt-0.5">在新名称后附加原始文件名</p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 操作按钮栏 */}
      <div className="flex items-center justify-between mt-5 pt-5 border-t border-gray-200">
        <button onClick={onBack} className="btn btn-secondary">
          ← 返回重新扫描
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            已选择 <strong>{selectedFilesCount}</strong> 项
            {(filesToMove.length > 0 || filesToRename.length > 0 || plan.stats.duplicateCount > 0) && (
              <span className="text-gray-400">
                {' '}（{filesToMove.length > 0 && `${filesToMove.length}待分类`}
                {filesToMove.length > 0 && filesToRename.length > 0 && '、'}
                {filesToRename.length > 0 && `${filesToRename.length}待重命名`}
                {(filesToMove.length > 0 || filesToRename.length > 0) && plan.stats.duplicateCount > 0 && '、'}
                {plan.stats.duplicateCount > 0 && `${plan.stats.duplicateCount}重复`}）
              </span>
            )}
          </span>
          <button onClick={exportPlan} className="btn btn-secondary">
            导出计划
          </button>
          <button
            onClick={() => onExecute(plan)}
            disabled={filesToMove.length === 0 && filesToRename.length === 0 && plan.stats.duplicateCount === 0}
            className="btn btn-primary btn-lg"
          >
            执行整理
          </button>
        </div>
      </div>
    </div>
  );
}
