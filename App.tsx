import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { removeWatermarkFromImage, generateVideoFromFrame } from './services/geminiService';
import { fileToBase64, extractFirstFrame } from './utils/fileUtils';
import { UploadIcon, SparklesIcon, DownloadIcon, TrashIcon, VideoIcon, ImageIcon, KeyIcon } from './components/Icons';
import Spinner from './components/Spinner';

type ImageState = {
  file: File;
  url: string;
};

type AppMode = 'image' | 'video';
type ApiKeyStatus = 'checking' | 'selected' | 'not_selected';


export default function App() {
  // Common state
  const [mode, setMode] = useState<AppMode>('image');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Image state
  const [originalImage, setOriginalImage] = useState<ImageState | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);

  // Video state
  const [originalVideo, setOriginalVideo] = useState<ImageState | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [videoLoadingMessage, setVideoLoadingMessage] = useState<string>('');
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('checking');

  useEffect(() => {
    if (mode === 'video') {
      const checkApiKey = async () => {
        setApiKeyStatus('checking');
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setApiKeyStatus(hasKey ? 'selected' : 'not_selected');
        } else {
            // Fallback for environments where aistudio might not be available
            setApiKeyStatus('not_selected');
        }
      };
      checkApiKey();
    }
  }, [mode]);


  const handleFileChange = (files: FileList | null) => {
    setError(null);
    if (files && files[0]) {
      const file = files[0];
      const fileType = file.type.split('/')[0];
      
      if (mode === 'image' && fileType === 'image') {
        handleReset();
        setOriginalImage({ file, url: URL.createObjectURL(file) });
      } else if (mode === 'video' && fileType === 'video') {
        handleReset();
        setOriginalVideo({ file, url: URL.createObjectURL(file) });
      } else {
        setError(`الرجاء تحميل ملف ${mode === 'image' ? 'صورة' : 'فيديو'} صالح.`);
      }
    }
  };

  const handleRemoveImageWatermark = useCallback(async () => {
    if (!originalImage) return;

    setIsLoading(true);
    setError(null);
    setProcessedImageUrl(null);

    try {
      const { data, mimeType } = await fileToBase64(originalImage.file);
      const resultBase64 = await removeWatermarkFromImage({ data, mimeType });
      if (resultBase64) {
        setProcessedImageUrl(`data:${mimeType};base64,${resultBase64}`);
      } else {
        throw new Error('لم يتم إرجاع أي صورة من الواجهة البرمجية.');
      }
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء معالجة الصورة. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  }, [originalImage]);
  
  const handleRemoveVideoWatermark = useCallback(async () => {
    if (!originalVideo) return;

    setIsLoading(true);
    setError(null);
    if(processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);
    setProcessedVideoUrl(null);

    try {
      setVideoLoadingMessage('استخراج الإطار الأول...');
      const { data: frameData, mimeType: frameMimeType, width, height } = await extractFirstFrame(originalVideo.file);
      
      setVideoLoadingMessage('إزالة العلامة المائية من الإطار...');
      const cleanFrameBase64 = await removeWatermarkFromImage({ data: frameData, mimeType: frameMimeType });
      if (!cleanFrameBase64) {
        throw new Error('لا يمكن إزالة العلامة المائية من الإطار الأول.');
      }
      
      setVideoLoadingMessage('إنشاء فيديو جديد... قد يستغرق هذا عدة دقائق.');
      const videoBlob = await generateVideoFromFrame({ data: cleanFrameBase64, mimeType: frameMimeType }, width, height);
      
      if (videoBlob) {
        setProcessedVideoUrl(URL.createObjectURL(videoBlob));
      } else {
        throw new Error('لم ينتج عن إنشاء الفيديو أي نتيجة.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.message === "API_KEY_INVALID") {
          setError('مفتاح API غير صالح. الرجاء تحديد مفتاح صالح والمحاولة مرة أخرى.');
          setApiKeyStatus('not_selected');
      } else {
          setError('حدث خطأ أثناء معالجة الفيديو. الرجاء المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoading(false);
      setVideoLoadingMessage('');
    }
  }, [originalVideo, processedVideoUrl]);


  const handleSelectKey = async () => {
    if(window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setApiKeyStatus('selected'); // Optimistically update
        setError(null);
    } else {
        setError("لا يمكن فتح محدد مفتاح API.");
    }
  };
  
  const handleReset = useCallback(() => {
    if (originalImage) URL.revokeObjectURL(originalImage.url);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    if (originalVideo) URL.revokeObjectURL(originalVideo.url);
    if (processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);
    
    setOriginalImage(null);
    setProcessedImageUrl(null);
    setOriginalVideo(null);
    setProcessedVideoUrl(null);
    setError(null);
    setIsLoading(false);
    setVideoLoadingMessage('');
  }, [originalImage, processedImageUrl, originalVideo, processedVideoUrl]);
  
  const dragEvents = useMemo(() => ({
    onDragEnter: (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); },
    onDragOver: (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileChange(e.dataTransfer.files);
    },
  }), [mode]);

  const currentOriginalAsset = mode === 'image' ? originalImage : originalVideo;

  const renderUploader = () => (
    <div 
        {...dragEvents}
        className={`relative w-full max-w-2xl border-2 border-dashed rounded-xl transition-all duration-300 ${isDragging ? 'border-cyan-400 bg-slate-800/50' : 'border-slate-600 hover:border-slate-500'}`}
    >
        <input
            type="file"
            id="file-upload"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept={mode === 'image' ? 'image/*' : 'video/*'}
            onChange={(e) => handleFileChange(e.target.files)}
        />
        <label htmlFor="file-upload" className="flex flex-col items-center justify-center text-center p-12 md:p-20 cursor-pointer">
            <UploadIcon className="w-16 h-16 text-slate-500 mb-4" />
            <p className="text-xl font-semibold text-slate-300">
                اسحب وأفلت {mode === 'image' ? 'صورة' : 'فيديو'} هنا أو <span className="text-cyan-400">تصفح الملفات</span>
            </p>
            <p className="text-slate-500 mt-2">
                {mode === 'image' ? 'يدعم: PNG, JPG, WEBP' : 'يدعم: MP4, MOV, WEBM'}
            </p>
        </label>
    </div>
  );
  
  const renderImageView = () => (
     <div className="w-full flex flex-col items-center gap-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            <ImageDisplay title="الصورة الأصلية" imageUrl={originalImage!.url} />
            <ImageDisplay title="بدون علامة مائية" imageUrl={processedImageUrl} isLoading={isLoading} error={error} />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md">
            <ActionButton
                onClick={handleRemoveImageWatermark}
                disabled={isLoading}
                icon={isLoading ? <Spinner /> : <SparklesIcon />}
                text={isLoading ? 'جاري المعالجة...' : 'إزالة العلامة المائية'}
                primary
            />
            {processedImageUrl && (
                <DownloadButton href={processedImageUrl} fileName={`watermark-removed-${originalImage!.file.name}`} />
            )}
            <ResetButton onClick={handleReset} />
        </div>
    </div>
  );

  const renderVideoView = () => (
    <div className="w-full flex flex-col items-center gap-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            <VideoDisplay title="الفيديو الأصلي" videoUrl={originalVideo!.url} />
            <VideoDisplay title="فيديو جديد" videoUrl={processedVideoUrl} isLoading={isLoading} loadingMessage={videoLoadingMessage} error={error} />
        </div>
        
        {apiKeyStatus !== 'selected' && !isLoading && (
            <ApiKeyPrompt onSelectKey={handleSelectKey} status={apiKeyStatus} />
        )}
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md">
            <ActionButton
                onClick={handleRemoveVideoWatermark}
                disabled={isLoading || apiKeyStatus !== 'selected'}
                icon={isLoading ? <Spinner /> : <SparklesIcon />}
                text={isLoading ? videoLoadingMessage : 'إنشاء فيديو جديد'}
                primary
            />
            {processedVideoUrl && (
                <DownloadButton href={processedVideoUrl} fileName={`watermark-removed-${originalVideo!.file.name.split('.').slice(0, -1).join('.')}.mp4`} />
            )}
            <ResetButton onClick={handleReset} />
        </div>
    </div>
  );


  return (
    <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4 selection:bg-cyan-400/20">
      <main className="w-full max-w-6xl mx-auto flex flex-col items-center">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
             <SparklesIcon className="w-10 h-10 text-cyan-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 text-transparent bg-clip-text">
              مزيل العلامة المائية
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            قم بإزالة العلامات المائية من صورك وفيديوهاتك باستخدام قوة الذكاء الاصطناعي.
          </p>
        </header>

        <div className="flex justify-center mb-8">
            <div className="flex p-1 bg-slate-800 rounded-lg border border-slate-700">
                <TabButton icon={<ImageIcon />} label="صورة" isActive={mode === 'image'} onClick={() => { setMode('image'); handleReset(); }} />
                <TabButton icon={<VideoIcon />} label="فيديو" isActive={mode === 'video'} onClick={() => { setMode('video'); handleReset(); }} />
            </div>
        </div>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-md mb-6 w-full max-w-2xl text-center">{error}</div>}

        {!currentOriginalAsset ? renderUploader() : (mode === 'image' ? renderImageView() : renderVideoView())}

      </main>
    </div>
  );
}

// UI Components
const ActionButton: React.FC<{onClick: () => void, disabled: boolean, icon: React.ReactNode, text: string, primary?: boolean}> = 
({ onClick, disabled, icon, text, primary = false }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:cursor-not-allowed ${
            primary 
            ? 'bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-800/50 text-white shadow-lg shadow-cyan-500/20' 
            : 'bg-slate-700 hover:bg-slate-600 text-white'
        }`}
    >
        {icon}
        <span>{text}</span>
    </button>
);

const DownloadButton: React.FC<{href: string, fileName: string}> = ({ href, fileName }) => (
    <a
        href={href}
        download={fileName}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
    >
        <DownloadIcon />
        <span>تحميل</span>
    </a>
);

const ResetButton: React.FC<{onClick: () => void}> = ({ onClick }) => (
    <button
        onClick={onClick}
        title="Start over"
        aria-label="Start over"
        className="w-full sm:w-auto flex items-center justify-center p-3 bg-transparent hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold rounded-lg transition-colors"
    >
        <TrashIcon />
    </button>
);


const TabButton: React.FC<{icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void}> = 
({ icon, label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-semibold ${
            isActive ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
        }`}
    >
        {icon}
        {label}
    </button>
);


interface DisplayProps {
  title: string;
  isLoading?: boolean;
  error?: string | null;
  loadingMessage?: string;
}

const ImageDisplay: React.FC<DisplayProps & { imageUrl: string | null }> = ({ title, imageUrl, isLoading = false, error = null }) => (
    <div className="w-full">
      <h2 className="text-xl font-bold text-center mb-4 text-slate-300">{title}</h2>
      <div className="relative aspect-video w-full bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700 shadow-md">
        {imageUrl && <img src={imageUrl} alt={title} className="w-full h-full object-contain" />}
        {isLoading && <LoadingOverlay message="يعمل الذكاء الاصطناعي بسحره..." />}
        {!imageUrl && !isLoading && !error && <Placeholder message="النتيجة ستظهر هنا" />}
        {error && <ErrorOverlay message={error} />}
      </div>
    </div>
);

const VideoDisplay: React.FC<DisplayProps & { videoUrl: string | null }> = ({ title, videoUrl, isLoading = false, error = null, loadingMessage = '' }) => (
    <div className="w-full">
      <h2 className="text-xl font-bold text-center mb-4 text-slate-300">{title}</h2>
      <div className="relative aspect-video w-full bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700 shadow-md">
        {videoUrl && <video src={videoUrl} controls autoPlay loop muted className="w-full h-full object-contain"></video>}
        {isLoading && <LoadingOverlay message={loadingMessage} />}
        {!videoUrl && !isLoading && !error && <Placeholder message="النتيجة ستظهر هنا" />}
        {error && <ErrorOverlay message={error} />}
      </div>
    </div>
);

const ApiKeyPrompt: React.FC<{onSelectKey: () => void, status: ApiKeyStatus}> = ({ onSelectKey, status }) => (
    <div className="w-full max-w-2xl p-4 bg-slate-800 border border-cyan-700/50 rounded-lg text-center">
        <h3 className="text-lg font-semibold text-cyan-300">مطلوب إجراء</h3>
        <p className="text-slate-400 my-2">
            تتطلب عملية إنشاء الفيديو مفتاح API الخاص بك. يرجى تحديد مفتاح للمتابعة.
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">
                (معلومات الفوترة)
            </a>
        </p>
        <button
            onClick={onSelectKey}
            disabled={status === 'checking'}
            className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-800 text-white font-bold rounded-lg transition-colors"
        >
            {status === 'checking' ? <Spinner/> : <KeyIcon />}
            <span>{status === 'checking' ? 'جار التحقق...' : 'تحديد مفتاح API'}</span>
        </button>
    </div>
);


const LoadingOverlay: React.FC<{message: string}> = ({ message }) => (
    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm p-4 text-center">
        <Spinner />
        <p className="text-slate-300 mt-4 text-lg">{message}</p>
    </div>
);

const ErrorOverlay: React.FC<{message: string}> = ({ message }) => (
    <div className="absolute inset-0 bg-red-900/50 flex flex-col items-center justify-center text-center p-4">
        <p className="text-red-300 font-semibold">فشل!</p>
        <p className="text-red-400">{message}</p>
    </div>
);

const Placeholder: React.FC<{message: string}> = ({ message }) => (
    <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-slate-500">{message}</p>
    </div>
);