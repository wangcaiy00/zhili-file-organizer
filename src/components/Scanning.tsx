import { useEffect, useState } from 'react';
import { FolderOpenIcon, CheckCircleIcon, SparklesIcon } from './Icons';
import { useElectron } from '../hooks/useElectron';

interface ScanningProps {
  folder: string;
  onComplete: () => void;
}

interface ScanStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export function Scanning({ folder, onComplete }: ScanningProps) {
  const { isDesktop, isOpencodeAvailable } = useElectron();
  const [steps, setSteps] = useState<ScanStep[]>([
    { id: 'scan', label: '扫描文件结构', status: 'pending' },
    { id: 'analyze', label: '分析文件类型', status: 'pending' },
    { id: 'extract', label: '提取文件信息', status: 'pending' },
    { id: 'classify', label: '智能分类', status: 'pending' },
    { id: 'naming', label: '生成命名建议', status: 'pending' },
    { id: 'duplicate', label: '检测重复文件', status: 'pending' },
    { id: 'plan', label: '生成整理计划', status: 'pending' },
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    // 模拟扫描进度
    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setSteps(prev => prev.map((step, idx) => ({
          ...step,
          status: idx < stepIndex ? 'done' : idx === stepIndex ? 'running' : 'pending'
        })));
        setCurrentStepIndex(stepIndex);
        
        // 模拟发现文件
        if (stepIndex === 0) {
          const timer = setInterval(() => {
            setFileCount(prev => Math.min(prev + Math.floor(Math.random() * 15) + 5, 247));
          }, 100);
          setTimeout(() => clearInterval(timer), 800);
        }
        
        stepIndex++;
      } else {
        // 全部完成
        setSteps(prev => prev.map(step => ({ ...step, status: 'done' })));
        clearInterval(interval);
        setTimeout(onComplete, 500);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [onComplete, steps.length]);

  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="content-container flex flex-col items-center justify-center">
      <div className="w-full max-w-xl animate-fadeIn">
        {/* 图标和标题 */}
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-6">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center">
              <FolderOpenIcon className="w-10 h-10 text-blue-600" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center animate-spin-slow">
              <SparklesIcon className="w-4 h-4 text-white" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            正在分析文件夹
          </h2>
          <p className="text-gray-500 font-mono text-sm truncate max-w-md mx-auto">
            {folder}
          </p>
        </div>

        {/* 进度条 */}
        <div className="card card-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">
              {isDesktop ? (isOpencodeAvailable ? 'AI 增强分析中...' : '本地规则分析中...') : '演示分析中...'}
            </span>
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {fileCount > 0 && (
            <div className="mt-3 text-sm text-gray-500">
              已发现 <span className="font-medium text-gray-700">{fileCount}</span> 个文件
            </div>
          )}
        </div>

        {/* 步骤列表 */}
        <div className="card card-lg p-6">
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  step.status === 'running' ? 'bg-blue-50' : ''
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.status === 'done' 
                    ? 'bg-green-100 text-green-600' 
                    : step.status === 'running'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}>
                  {step.status === 'done' ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : step.status === 'running' ? (
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="text-xs">{index + 1}</span>
                  )}
                </div>
                <span className={`text-sm ${
                  step.status === 'done' 
                    ? 'text-gray-600' 
                    : step.status === 'running'
                      ? 'text-blue-700 font-medium'
                      : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
                {step.status === 'running' && (
                  <div className="ml-auto">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 提示 */}
        <div className="mt-6 text-center text-sm text-gray-400">
          {isDesktop ? '正在本地分析，您的文件不会上传' : '演示模式，使用模拟数据'}
        </div>
      </div>
    </div>
  );
}
