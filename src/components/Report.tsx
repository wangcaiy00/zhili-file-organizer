import { useState, useCallback } from 'react';
import { OrganizePlan, CategoryType } from '../types';
import { CheckCircleIcon, FolderIcon, ArrowPathIcon, ArrowRightIcon, getCategoryIcon } from './Icons';
import { useElectron } from '../hooks/useElectron';

interface ReportProps {
  plan: OrganizePlan;
  onReset: () => void;
  onUndo: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const categoryOrder: CategoryType[] = ['合同', '发票', '截图', '说明书', '图片', '视频', '音频', '文档', '压缩包', '代码', '其他'];

export function Report({ plan, onReset, onUndo }: ReportProps) {
  const { isDesktop, undoOrganize, saveFile, writeFile, openPath } = useElectron();
  const [undoing, setUndoing] = useState(false);
  const [undoSuccess, setUndoSuccess] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    setUndoError(null);
    
    if (isDesktop) {
      try {
        const result = await undoOrganize();
        if (result.success) {
          setUndoSuccess(true);
          setTimeout(() => onUndo(), 1500);
        } else {
          setUndoError(result.error || '撤销失败');
        }
      } catch (err) {
        setUndoError((err as Error).message);
      }
    } else {
      // Web 演示模式
      await new Promise(resolve => setTimeout(resolve, 1000));
      setUndoSuccess(true);
      setTimeout(() => onUndo(), 1500);
    }
    
    setUndoing(false);
  }, [isDesktop, undoOrganize, onUndo]);

  const handleExportReport = useCallback(async () => {
    const report = {
      exportTime: new Date().toISOString(),
      summary: {
        totalFiles: plan.stats.totalFiles,
        totalSize: plan.stats.totalSize,
        categoriesCreated: Object.keys(plan.categories).length,
        filesRenamed: plan.stats.renamedCount,
        duplicatesRemoved: plan.stats.duplicateCount,
        spaceFreed: plan.duplicates
          .flatMap(g => g.files.filter((_, i) => i !== g.keepIndex))
          .reduce((sum, f) => sum + f.size, 0),
      },
      categories: Object.entries(plan.stats.categorizedCount).map(([name, count]) => ({
        name,
        fileCount: count,
      })),
      renamedFiles: plan.files
        .filter(f => f.originalName !== f.newName)
        .map(f => ({
          original: f.originalName,
          new: f.newName,
          category: f.category,
        })),
      removedDuplicates: plan.duplicates.map(g => ({
        kept: g.files[g.keepIndex]?.name,
        removed: g.files.filter((_, i) => i !== g.keepIndex).map(f => f.name),
      })),
    };

    const content = JSON.stringify(report, null, 2);
    const filename = `整理报告_${new Date().toISOString().split('T')[0]}.json`;

    if (isDesktop) {
      const filePath = await saveFile({
        defaultPath: filename,
        filters: [{ name: 'JSON文件', extensions: ['json'] }],
      });
      if (filePath) {
        await writeFile(filePath, content);
      }
    } else {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [isDesktop, plan, saveFile, writeFile]);

  const handleOpenFolder = useCallback(() => {
    if (isDesktop && openPath) {
      // 打开整理后的文件夹
      const firstFile = plan.files[0];
      if (firstFile?.path) {
        const folderPath = firstFile.path.substring(0, firstFile.path.lastIndexOf('\\'));
        openPath(folderPath);
      }
    }
  }, [isDesktop, openPath, plan.files]);

  const freedSpace = plan.duplicates
    .flatMap(g => g.files.filter((_, i) => i !== g.keepIndex))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="content-container-full flex flex-col animate-fadeIn">
      {/* 成功标题 */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircleIcon className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">整理完成！</h1>
        <p className="text-gray-500">所有文件已按计划整理完毕</p>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* 左侧：统计摘要 */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-5">
          {/* 统计卡片 */}
          <div className="card p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-4">整理摘要</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">
                  {Object.keys(plan.categories).length}
                </p>
                <p className="text-sm text-gray-500 mt-1">创建目录</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-3xl font-bold text-purple-600">
                  {plan.stats.renamedCount}
                </p>
                <p className="text-sm text-gray-500 mt-1">重命名</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <p className="text-3xl font-bold text-amber-600">
                  {plan.stats.duplicateCount}
                </p>
                <p className="text-sm text-gray-500 mt-1">删除重复</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">
                  {formatSize(freedSpace)}
                </p>
                <p className="text-sm text-gray-500 mt-1">释放空间</p>
              </div>
            </div>
          </div>

          {/* 目录结构 */}
          <div className="card p-5 flex-1 overflow-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-4">创建的目录</h3>
            <div className="space-y-2">
              {categoryOrder.map((category) => {
                const count = plan.stats.categorizedCount[category] || 0;
                if (count === 0) return null;
                return (
                  <div key={category} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                      {getCategoryIcon(category)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{category}/</p>
                    </div>
                    <span className="text-sm text-gray-400">{count} 个文件</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：详情 */}
        <div className="flex-1 card flex flex-col min-w-0">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-700">重命名详情</h3>
            <p className="text-xs text-gray-400 mt-1">共 {plan.stats.renamedCount} 个文件被重命名</p>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <div className="space-y-2">
              {plan.files
                .filter(f => f.originalName !== f.newName)
                .slice(0, 50)
                .map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                    {getCategoryIcon(file.category)}
                    <span className="text-gray-500 truncate flex-1">{file.originalName}</span>
                    <ArrowRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <span className="text-gray-800 font-medium truncate flex-1">{file.newName}</span>
                  </div>
                ))}
              {plan.files.filter(f => f.originalName !== f.newName).length > 50 && (
                <p className="text-center text-sm text-gray-400 py-2">
                  还有 {plan.files.filter(f => f.originalName !== f.newName).length - 50} 个文件...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between mt-5 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-3">
          {undoSuccess ? (
            <span className="text-green-600 text-sm flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              撤销成功，正在恢复...
            </span>
          ) : undoError ? (
            <span className="text-red-600 text-sm">{undoError}</span>
          ) : (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="btn btn-secondary"
            >
              {undoing ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  撤销中...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="w-4 h-4" />
                  撤销整理
                </>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isDesktop && (
            <button onClick={handleOpenFolder} className="btn btn-secondary">
              <FolderIcon className="w-4 h-4" />
              打开文件夹
            </button>
          )}
          <button onClick={handleExportReport} className="btn btn-secondary">
            导出报告
          </button>
          <button onClick={onReset} className="btn btn-primary btn-lg">
            整理其他文件夹
          </button>
        </div>
      </div>
    </div>
  );
}
