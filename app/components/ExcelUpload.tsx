'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// FileList is only available in browser, handle SSR safely
const uploadSchema = z.object({
  mainFile: z.any().refine(
    (files) => {
      if (!files) return false;
      // Check if FileList exists (browser only)
      if (typeof FileList !== 'undefined' && files instanceof FileList) {
        return files.length > 0;
      }
      // Fallback for other cases
      if (Array.isArray(files)) {
        return files.length > 0;
      }
      // Handle FileList-like objects
      if (files && typeof files.length === 'number') {
        return files.length > 0;
      }
      return false;
    },
    'Main Excel file is required'
  ).optional(),
  e1File: z.any().refine(
    (files) => {
      if (!files) return false;
      // Check if FileList exists (browser only)
      if (typeof FileList !== 'undefined' && files instanceof FileList) {
        return files.length > 0;
      }
      // Fallback for other cases
      if (Array.isArray(files)) {
        return files.length > 0;
      }
      // Handle FileList-like objects
      if (files && typeof files.length === 'number') {
        return files.length > 0;
      }
      return false;
    },
    'E1 Excel file is required'
  ).optional(),
}).refine(
  (data) => {
    const checkFile = (files: any) => {
      if (!files) return false;
      if (typeof FileList !== 'undefined' && files instanceof FileList) {
        return files.length > 0;
      }
      if (Array.isArray(files)) {
        return files.length > 0;
      }
      if (files && typeof files.length === 'number') {
        return files.length > 0;
      }
      return false;
    };
    
    return checkFile(data.mainFile) || checkFile(data.e1File);
  },
  {
    message: 'At least one Excel file is required',
    path: ['mainFile'],
  }
);

type UploadFormData = z.infer<typeof uploadSchema>;

interface FileInfo {
  name: string;
  size: number;
  type: 'main' | 'e1';
}

export default function ExcelUpload({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'e1') => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const file = fileList[0];
      setFiles((prev) => {
        const filtered = prev.filter((f) => f.type !== type);
        return [...filtered, { name: file.name, size: file.size, type }];
      });
      setError(null);
      setValidationErrors([]);
    }
  };

  const removeFile = (type: 'main' | 'e1') => {
    setFiles((prev) => prev.filter((f) => f.type !== type));
    setError(null);
    setValidationErrors([]);
    // Reset the input
    const input = document.getElementById(`${type}File`) as HTMLInputElement;
    if (input) input.value = '';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const onSubmit = async (data: UploadFormData) => {
    setUploading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const formData = new FormData();

      if (data.mainFile && data.mainFile.length > 0) {
        formData.append('mainFile', data.mainFile[0]);
      }

      if (data.e1File && data.e1File.length > 0) {
        formData.append('e1File', data.e1File[0]);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors);
        } else {
          setError(result.error || 'Upload failed');
        }
        setUploading(false);
        return;
      }

      // Success
      setFiles([]);
      reset();
      onUploadSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Upload Excel Files</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Main Excel File */}
        <div>
          <label htmlFor="mainFile" className="block text-sm font-medium text-gray-700 mb-2">
            Main Excel (Master Sheet) <span className="text-red-500">*</span>
          </label>
          <input
            id="mainFile"
            type="file"
            accept=".xlsx,.xls"
            {...register('mainFile')}
            onChange={(e) => {
              register('mainFile').onChange(e);
              handleFileChange(e, 'main');
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {errors.mainFile && (
            <p className="mt-1 text-sm text-red-600">{errors.mainFile.message as string}</p>
          )}
        </div>

        {/* E1 Excel File */}
        <div>
          <label htmlFor="e1File" className="block text-sm font-medium text-gray-700 mb-2">
            E1 Excel (Employee Attendance) <span className="text-red-500">*</span>
          </label>
          <input
            id="e1File"
            type="file"
            accept=".xlsx,.xls"
            {...register('e1File')}
            onChange={(e) => {
              register('e1File').onChange(e);
              handleFileChange(e, 'e1');
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {errors.e1File && (
            <p className="mt-1 text-sm text-red-600">{errors.e1File.message as string}</p>
          )}
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Selected Files:</p>
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file.type)}
                  className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-sm font-medium text-red-800 mb-2">Validation Errors:</h3>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index} className="text-sm text-red-700">
                  <strong>{error.file}:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    {error.errors.map((err: string, errIndex: number) => (
                      <li key={errIndex} className="text-xs">{err}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* General Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Upload Button */}
        <button
          type="submit"
          disabled={uploading || files.length === 0}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
        >
          {uploading ? 'Uploading...' : 'Upload & Process Files'}
        </button>
      </form>
    </div>
  );
}

