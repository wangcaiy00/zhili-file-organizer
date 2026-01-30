import { useState, useCallback } from 'react';
import { AppStep, OrganizePlan, FileItem, CategoryType, DuplicateGroup } from './types';
import { generateMockFiles, generateOrganizePlan } from './data/mockData';
import { SelectFolder } from './components/SelectFolder';
import { Scanning } from './components/Scanning';
import { PreviewPlan } from './components/PreviewPlan';
import { Executing } from './components/Executing';
import { Report } from './components/Report';
import { AILogViewer } from './components/AILogViewer';
import { FolderOpenIcon, ShieldCheckIcon, SparklesIcon, MinusIcon, XMarkIcon, WindowIcon, DocumentTextIcon } from './components/Icons';
import { useElectron } from './hooks/useElectron';
import type { ScannedFile, AnalysisResult, DuplicateGroup as ElectronDuplicateGroup } from './hooks/useElectron';

const stepLabels: Record<AppStep, string> = {
  select: '选择文件夹',
  scanning: '扫描分析',
  preview: '预览计划',
  executing: '执行整理',
  report: '完成报告',
};

const steps: AppStep[] = ['select', 'scanning', 'preview', 'executing', 'report'];

export function App() {
  const [step, setStep] = useState<AppStep>('select');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [plan, setPlan] = useState<OrganizePlan | null>(null);
  const [showAILog, setShowAILog] = useState(false);
  
  const { 
    isDesktop, 
    isOpencodeAvailable, 
    isLoading,
    windowControls,
    scanFolder,
    analyzeFiles,
    detectDuplicates,
  } = useElectron();

  const handleSelectFolder = useCallback((folder: string) => {
    setSelectedFolder(folder);
    setStep('scanning');
  }, []);

  const convertToFileItems = useCallback((
    scannedFiles: ScannedFile[], 
    analysisResults?: AnalysisResult[]
  ): FileItem[] => {
    return scannedFiles.map((sf, index) => {
      const analysis = analysisResults?.find(r => r.path === sf.path);
      const category = (analysis?.category || '其他') as CategoryType;
      const isShortcut = analysis?.isShortcut || category === '快捷方式';
      const needsRename = analysis?.needsRename || false;
      const needsMove = analysis?.needsMove || false;
      
      // 文件夹保持原名，文件使用建议名（如果需要重命名）
      const newName = sf.isDirectory || !needsRename 
        ? sf.name 
        : (analysis?.suggestedName || sf.name);

      return {
        id: `file-${index}-${Date.now()}`,
        name: sf.name,
        originalName: sf.name,
        newName: newName,
        type: sf.isDirectory ? 'folder' : sf.extension.replace('.', ''),
        size: sf.size,
        category: category,
        path: sf.path,
        hash: undefined,
        content: undefined,
        createdAt: new Date(sf.modifiedTime),
        modifiedAt: new Date(sf.modifiedTime),
        selected: true,
        keepInDuplicate: true,
        isDirectory: sf.isDirectory,
        isSymlink: sf.isSymlink,
        isShortcut: isShortcut,
        needsRename: needsRename,
        needsMove: needsMove,
      };
    });
  }, []);

  const convertDuplicates = useCallback((
    electronDups: ElectronDuplicateGroup[]
  ): DuplicateGroup[] => {
    return electronDups.map(dup => ({
      hash: dup.hash,
      files: dup.files.map((f, idx) => ({
        id: `dup-${dup.hash}-${idx}`,
        name: f.name,
        originalName: f.name,
        newName: f.name,
        type: f.name.split('.').pop() || '',
        size: f.size,
        category: '其他' as CategoryType,
        path: f.path,
        createdAt: new Date(),
        modifiedAt: new Date(),
        selected: true,
        keepInDuplicate: f.isKeep,
      })),
      keepIndex: dup.files.findIndex(f => f.isKeep),
    }));
  }, []);

  const handleScanComplete = useCallback(async () => {
    if (isDesktop && selectedFolder) {
      try {
        console.log('[桌面端] 开始扫描文件夹:', selectedFolder);
        
        const scannedFiles = await scanFolder(selectedFolder);
        console.log('[桌面端] 扫描完成，共', scannedFiles.length, '个文件');
        
        if (scannedFiles.length === 0) {
          const emptyPlan: OrganizePlan = {
            files: [],
            categories: {},
            duplicates: [],
            stats: {
              totalFiles: 0,
              totalFolders: 0,
              totalSize: 0,
              categorizedCount: {},
              duplicateCount: 0,
              renamedCount: 0,
              movedCount: 0,
              shortcutCount: 0,
            },
            namingRules: {
              addDatePrefix: true,
              extractTheme: true,
              keepOriginalName: false,
              dateFormat: 'YYYYMMDD',
            },
            categoriesNeedingFolders: [],
          };
          setPlan(emptyPlan);
          setStep('preview');
          return;
        }

        // 分析所有文件和文件夹
        const filesToAnalyze = scannedFiles.map(f => ({
          name: f.name,
          path: f.path,
          extension: f.extension,
          size: f.size,
          isDirectory: f.isDirectory,
        }));
        
        console.log('[桌面端] 开始AI分析...');
        const { results, usedAI } = await analyzeFiles(filesToAnalyze);
        console.log('[桌面端] AI分析完成，使用AI:', usedAI);

        // 只对文件检测重复（文件夹不检测重复）
        const filesForDupCheck = scannedFiles
          .filter(f => !f.isDirectory)
          .map(f => ({ path: f.path, size: f.size, name: f.name }));
        
        console.log('[桌面端] 检测重复文件...');
        const duplicates = await detectDuplicates(filesForDupCheck);
        console.log('[桌面端] 发现', duplicates.length, '组重复文件');

        // 将所有扫描结果（包括文件和文件夹）转换为 FileItem
        const fileItems = convertToFileItems(scannedFiles, results);

        const generatedPlan = generateOrganizePlan(fileItems);
        
        if (duplicates.length > 0) {
          generatedPlan.duplicates = convertDuplicates(duplicates);
          generatedPlan.stats.duplicateCount = duplicates.reduce(
            (sum, d) => sum + d.files.length - 1, 0
          );
        }
        
        console.log('[桌面端] 整理计划生成完成');
        setPlan(generatedPlan);
      } catch (error) {
        console.error('[桌面端] 处理失败:', error);
        alert('扫描文件夹时发生错误，请重试。\n' + (error as Error).message);
        setStep('select');
        return;
      }
    } else {
      console.warn('[Web模式] 使用模拟数据进行演示');
      const files = generateMockFiles();
      const generatedPlan = generateOrganizePlan(files);
      setPlan(generatedPlan);
    }
    
    setStep('preview');
  }, [isDesktop, selectedFolder, scanFolder, analyzeFiles, detectDuplicates, convertToFileItems, convertDuplicates]);

  const handleUpdatePlan = useCallback((updatedPlan: OrganizePlan) => {
    setPlan(updatedPlan);
  }, []);

  const handleExecute = useCallback(() => {
    setStep('executing');
  }, []);

  const handleExecuteComplete = useCallback(() => {
    setStep('report');
  }, []);

  const handleReset = useCallback(() => {
    setStep('select');
    setSelectedFolder('');
    setPlan(null);
  }, []);

  const handleUndo = useCallback(() => {
    handleReset();
  }, [handleReset]);

  const handleBackToSelect = useCallback(() => {
    setStep('select');
    setPlan(null);
  }, []);

  if (isLoading) {
    return (
      <div className="app-layout items-center justify-center">
        <div className="text-gray-500">初始化中...</div>
      </div>
    );
  }

  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="app-layout">
      {/* 固定头部 */}
      <header 
        className="app-header"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 标题栏 */}
        <div className="flex items-center h-12 px-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FolderOpenIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-gray-800">智理</span>
              <span className="text-sm text-gray-400">文件夹整理助手</span>
            </div>
          </div>
          
          <div className="flex-1" />
          
          {/* 状态标签 */}
          <div 
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {isDesktop ? (
              <>
                {isOpencodeAvailable ? (
                  <button 
                    onClick={() => setShowAILog(true)}
                    className="tag bg-purple-50 text-purple-600 hover:bg-purple-100 cursor-pointer transition-colors"
                    title="点击查看 AI 交互日志"
                  >
                    <SparklesIcon className="w-3.5 h-3.5" />
                    AI增强
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowAILog(true)}
                    className="tag bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"
                    title="点击查看处理日志"
                  >
                    本地规则
                  </button>
                )}
                <span className="tag bg-green-50 text-green-600">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  本地运行
                </span>
              </>
            ) : (
              <span className="tag bg-amber-50 text-amber-600">
                演示模式
              </span>
            )}
          </div>

          {/* 窗口控制 */}
          {isDesktop && (
            <div 
              className="flex items-center ml-4"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={windowControls.minimize}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                title="最小化"
              >
                <MinusIcon className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={windowControls.maximize}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                title="最大化"
              >
                <WindowIcon className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={windowControls.close}
                className="w-9 h-9 flex items-center justify-center hover:bg-red-500 hover:text-white rounded-lg transition-colors text-gray-500"
                title="关闭"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center justify-center h-12 px-6 bg-gray-50/80">
          {steps.map((s, index) => (
            <div key={s} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`
                  w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center transition-colors
                  ${index < currentStepIndex 
                    ? 'bg-blue-600 text-white' 
                    : index === currentStepIndex 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }
                `}>
                  {index < currentStepIndex ? '✓' : index + 1}
                </div>
                <span className={`text-sm font-medium ${
                  index <= currentStepIndex ? 'text-gray-700' : 'text-gray-400'
                }`}>
                  {stepLabels[s]}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-12 h-0.5 mx-4 transition-colors ${
                  index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </header>

      {/* 可滚动的主内容区 */}
      <main className="app-main">
        {step === 'select' && <SelectFolder onSelect={handleSelectFolder} />}
        
        {step === 'scanning' && (
          <Scanning folder={selectedFolder} onComplete={handleScanComplete} />
        )}
        
        {step === 'preview' && plan && (
          <PreviewPlan 
            plan={plan} 
            onExecute={handleExecute} 
            onBack={handleBackToSelect}
            onUpdatePlan={handleUpdatePlan}
          />
        )}
        
        {step === 'executing' && plan && (
          <Executing 
            plan={plan} 
            folder={selectedFolder}
            onComplete={handleExecuteComplete} 
          />
        )}
        
        {step === 'report' && plan && (
          <Report plan={plan} onReset={handleReset} onUndo={handleUndo} />
        )}
      </main>

      {/* 固定底部 */}
      <footer className="app-footer px-5 py-2 flex items-center justify-between text-sm text-gray-500">
        <span className="truncate max-w-lg">
          {selectedFolder ? `📁 ${selectedFolder}` : '就绪'}
        </span>
        <div className="flex items-center gap-6">
          {!isDesktop && (
            <span className="text-amber-600 text-sm">
              💡 下载桌面版体验完整功能
            </span>
          )}
          <span className="text-gray-400">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
