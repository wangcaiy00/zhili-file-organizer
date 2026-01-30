import React, { useState, useEffect, useRef } from 'react';
import { useElectron, AILogEntry } from '../hooks/useElectron';
import { XMarkIcon, TrashIcon, ArrowDownTrayIcon } from './Icons';

interface AILogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AILogViewer: React.FC<AILogViewerProps> = ({ isOpen, onClose }) => {
  const { isDesktop, getAILogs, clearAILogs, exportAILogs, subscribeAILogs } = useElectron();
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'request' | 'response' | 'error' | 'info'>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 加载日志
  useEffect(() => {
    if (isOpen && isDesktop) {
      getAILogs().then(setLogs);
    }
  }, [isOpen, isDesktop, getAILogs]);

  // 订阅实时更新
  useEffect(() => {
    if (isOpen && isDesktop) {
      const unsubscribe = subscribeAILogs((newLog) => {
        setLogs((prev) => [...prev, newLog]);
        // 自动滚动到底部
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 100);
      });
      return unsubscribe;
    }
  }, [isOpen, isDesktop, subscribeAILogs]);

  const handleClear = async () => {
    await clearAILogs();
    setLogs([]);
  };

  const handleExport = async () => {
    const result = await exportAILogs();
    if (result.success) {
      alert(`日志已导出到: ${result.path}`);
    } else {
      alert(`导出失败: ${result.error}`);
    }
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter(log => log.type === filter);

  const getLogTypeStyle = (type: AILogEntry['type']) => {
    switch (type) {
      case 'request':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'response':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'fallback':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
        return 'bg-gray-50 border-gray-200 text-gray-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  const getLogTypeLabel = (type: AILogEntry['type']) => {
    switch (type) {
      case 'request': return '请求';
      case 'response': return '响应';
      case 'error': return '错误';
      case 'fallback': return '降级';
      case 'info': return '信息';
      default: return type;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-gray-900">AI 交互日志</h3>
            <span className="text-xs text-gray-500">共 {logs.length} 条记录</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
              title="导出日志"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              导出
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
              title="清除日志"
            >
              <TrashIcon className="w-4 h-4" />
              清除
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 过滤器 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">筛选:</span>
          {(['all', 'request', 'response', 'error', 'info'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-xs rounded ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f === 'all' ? '全部' : getLogTypeLabel(f as AILogEntry['type'])}
            </button>
          ))}
        </div>

        {/* 日志列表 */}
        <div ref={logContainerRef} className="flex-1 overflow-auto p-4 space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {logs.length === 0 ? '暂无 AI 交互日志' : '没有匹配的日志'}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`border rounded-lg p-3 ${getLogTypeStyle(log.type)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                      log.type === 'request' ? 'bg-blue-200' :
                      log.type === 'response' ? 'bg-green-200' :
                      log.type === 'error' ? 'bg-red-200' :
                      log.type === 'fallback' ? 'bg-yellow-200' : 'bg-gray-200'
                    }`}>
                      {getLogTypeLabel(log.type)}
                    </span>
                    <span className="text-xs opacity-75">{formatTime(log.timestamp)}</span>
                  </div>
                  {log.duration && (
                    <span className="text-xs opacity-75">{log.duration}ms</span>
                  )}
                </div>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-white/50 rounded p-2 max-h-48 overflow-auto">
                  {log.content}
                </pre>
              </div>
            ))
          )}
        </div>

        {/* 底部说明 */}
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            💡 此日志记录了与 opencode 的所有交互，包括请求、响应和错误信息。可用于调试和分析 AI 处理过程。
          </p>
        </div>
      </div>
    </div>
  );
};
