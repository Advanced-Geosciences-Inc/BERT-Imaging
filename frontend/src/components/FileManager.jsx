import React, { useState, useCallback } from "react";
import { Upload, FileText, Download, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function FileManager({ backendUrl, onFileSelect, currentFileId }) {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.stg') && !fileName.endsWith('.srt')) {
      setUploadStatus({
        type: 'error',
        message: 'Please upload STG or SRT files only'
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${backendUrl}/api/import/stg`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      
      // Get detailed file information
      const inspectResponse = await fetch(`${backendUrl}/api/inspect/${result.file_id}`);
      const inspectData = await inspectResponse.json();
      
      const fileInfo = {
        id: result.file_id,
        name: file.name,
        size: file.size,
        uploadTime: new Date(),
        nReadings: result.n_readings,
        metadata: result.metadata,
        inspectData: inspectData
      };
      
      setUploadedFiles(prev => [...prev, fileInfo]);
      setUploadStatus({
        type: 'success',
        message: `Successfully uploaded ${file.name} (${result.n_readings} readings)`
      });

      // Auto-select the uploaded file
      onFileSelect(result.file_id, fileInfo);

    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error.message
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = '';
    }
  }, [backendUrl, onFileSelect]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            File Upload
          </CardTitle>
          <CardDescription>
            Upload AGI STG or SRT files for analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                accept=".stg,.srt"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
                id="file-upload"
                data-testid="file-upload-input"
              />
              <label 
                htmlFor="file-upload" 
                className="cursor-pointer flex flex-col items-center space-y-2"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">
                  {isUploading ? 'Uploading...' : 'Click to upload STG/SRT files'}
                </span>
                <span className="text-xs text-gray-400">
                  Supports AGI SuperSting formats
                </span>
              </label>
            </div>

            {uploadStatus && (
              <Alert className={uploadStatus.type === 'error' ? 'border-red-200' : 'border-green-200'}>
                {uploadStatus.type === 'error' ? 
                  <AlertCircle className="h-4 w-4 text-red-500" /> : 
                  <CheckCircle className="h-4 w-4 text-green-500" />
                }
                <AlertDescription className={uploadStatus.type === 'error' ? 'text-red-700' : 'text-green-700'}>
                  {uploadStatus.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File List Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Files
          </CardTitle>
          <CardDescription>
            Manage your uploaded datasets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No files uploaded yet
            </div>
          ) : (
            <div className="space-y-3">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    currentFileId === file.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => onFileSelect(file.id, file)}
                  data-testid={`file-item-${file.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">{file.name}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{file.nReadings} readings</span>
                        {file.inspectData && (
                          <span>{file.inspectData.n_electrodes} electrodes</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary">
                          {file.metadata?.importer || 'STG'}
                        </Badge>
                        {file.metadata?.has_k && (
                          <Badge variant="outline">K-factors</Badge>
                        )}
                        {file.metadata?.has_ip && (
                          <Badge variant="outline">IP data</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement download
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
                          if (currentFileId === file.id) {
                            onFileSelect(null, null);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}