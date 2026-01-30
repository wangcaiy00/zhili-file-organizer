import { useEffect, useState } from 'react';
import { CheckCircleIcon, FolderOpenIcon, SparklesIcon } from './Icons';
import { OrganizePlan } from '../types';
import { useElectron } from '../hooks/useElectron';

interface ExecutingProps {
  plan: OrganizePlan;
  folder: string;
  onComplete: () => void;
}

interface ExecuteStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
  detail?: string;
}

export function Executing({ plan, folder, onComplete }: ExecutingProps) {
  const { isDesktop, executeOrganize } = useElectron();
  const [steps, setSteps] = useState<ExecuteStep[]>([
    { id: 'backup', label: '创建备份点', status: 'pending' },
    { id: 'folders', label: '创建目录结构', status: 'pending' },
    { id: 'move', label: '移动文件到分类目录', status: 'pending' },
    { id: 'rename', label: '执行重命名', status: 'pending' },
    { id: 'cleanup', label: '清理重复文件', status: 'pending' },
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const execute = async () => {
      if (isDesktop) {
        // 桌面端：真实执行
        try {
          // 模拟步骤进度（实际执行在后端）
          for (let i = 0; i < steps.length; i++) {
            setCurrentStepIndex(i);
            setSteps(prev => prev.map((step, idx) => ({
              ...step,
              status: idx < i ? 'done' : idx === i ? 'running' : 'pending'
            })));
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // 调用真实 API
          const organizePlan = {
            folderPath: folder,
            categories: Object.keys(plan.categories),
            files: plan.files
              .filter(f => f.selected)
              .map(f => ({
                path: f.path,
                category: f.category,
                newName: f.newName,
              })),
            duplicatesToDelete: plan.duplicates.flatMap(g => 
              g.files
                .filter((_, i) => i !== g.keepIndex)
                .map(f => f.path)
            ),
          };

          const result = await executeOrganize(organizePlan);
          
          if (result.success) {
            setSteps(prev => prev.map(step => ({ ...step, status: 'done' })));
            setTimeout(onComplete, 500);
          } else {
            setError(result.error || '执行失败');
          }
        } catch (err) {
          setError((err as Error).message);
        }
      } else {
        // Web 演示模式
        let stepIndex = 0;
        const stepDetails = [
          '已创建恢复点',
          `创建了 ${Object.keys(plan.categories).length} 个目录`,
          `移动了 ${plan.files.filter(f => f.selected).length} 个文件`,
          `重命名了 ${plan.stats.renamedCount} 个文件`,
          `删除了 ${plan.stats.duplicateCount} 个重复文件`,
        ];

        const interval = setInterval(() => {
          if (stepIndex < steps.length) {
            setSteps(prev => prev.map((step, idx) => ({
              ...step,
              status: idx < stepIndex ? 'done' : idx === stepIndex ? 'running' : 'pending',
              detail: idx < stepIndex ? stepDetails[idx] : undefined
            })));
            setCurrentStepIndex(stepIndex);
            stepIndex++;
          } else {
            setSteps(prev => prev.map((step, idx) => ({
              ...step,
              status: 'done',
              detail: stepDetails[idx]
            })));
            clearInterval(interval);
            setTimeout(onComplete, 500);
          }
        }, 800);

        return () => clearInterval(interval);
      }
    };

    execute();
  }, [isDesktop, executeOrganize, folder, onComplete, plan, steps.length]);

  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="content-container flex flex-col items-center justify-center">
      <div className="w-full max-w-xl animate-fadeIn">
        {/* 图标和标题 */}
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-6">
            <div className="w-20 h-20 rounded-2xl bg-green-100 flex items-center justify-center">
              <FolderOpenIcon className="w-10 h-10 text-green-600" />
            </div>
            {!error && (
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center animate-pulse">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {error ? '执行出错' : '正在执行整理'}
          </h2>
          <p className="text-gray-500">
            {error ? '请检查文件权限后重试' : '请勿关闭窗口，所有操作支持撤销'}
          </p>
        </div>

        {error ? (
          <div className="card card-lg p-6 bg-red-50 border-red-200">
            <p className="text-red-600 text-center">{error}</p>
          </div>
        ) : (
          <>
            {/* 进度条 */}
            <div className="card card-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">执行进度</span>
                <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* 步骤列表 */}
            <div className="card card-lg p-6">
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      step.status === 'running' ? 'bg-green-50' : ''
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      step.status === 'done' 
                        ? 'bg-green-100 text-green-600' 
                        : step.status === 'running'
                          ? 'bg-green-600 text-white'
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
                    <div className="flex-1">
                      <span className={`text-sm ${
                        step.status === 'done' 
                          ? 'text-gray-600' 
                          : step.status === 'running'
                            ? 'text-green-700 font-medium'
                            : 'text-gray-400'
                      }`}>
                        {step.label}
                      </span>
                      {step.detail && (
                        <p className="text-xs text-gray-400 mt-0.5">{step.detail}</p>
                      )}
                    </div>
                    {step.status === 'running' && (
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 提示 */}
        <div className="mt-6 text-center text-sm text-gray-400">
          {isDesktop ? '已创建恢复点，可随时撤销所有更改' : '演示模式，实际文件不会被修改'}
        </div>
      </div>
    </div>
  );
}
