import React, { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileManager from "./components/FileManager";
import QAQCInterface from "./components/QAQCInterface";
import InversionInterface from "./components/InversionInterface";
import BertInterface from "./components/BertInterface";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [currentFileId, setCurrentFileId] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [qaQcSettings, setQaQcSettings] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <BrowserRouter>
        <div className="max-w-7xl mx-auto p-4">
          <header className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">BERT 2D Imager</h1>
            <p className="text-gray-600">Electrical Resistivity & IP Data Analysis</p>
          </header>

          <Tabs defaultValue="files" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="files" data-testid="files-tab">File I/O</TabsTrigger>
              <TabsTrigger 
                value="qaqc" 
                disabled={!currentFileId}
                data-testid="qaqc-tab"
              >
                QA/QC
              </TabsTrigger>
              <TabsTrigger 
                value="inversion" 
                disabled={!currentFileId}
                data-testid="inversion-tab"
              >
                Canvas Plots
              </TabsTrigger>
              <TabsTrigger 
                value="bert" 
                disabled={!currentFileId}
                data-testid="bert-tab"
              >
                BERT Native
              </TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="space-y-4">
              <FileManager 
                backendUrl={BACKEND_URL}
                onFileSelect={(fileId, data) => {
                  setCurrentFileId(fileId);
                  setFileData(data);
                }}
                currentFileId={currentFileId}
              />
            </TabsContent>

            <TabsContent value="qaqc" className="space-y-4">
              {currentFileId ? (
                <QAQCInterface 
                  backendUrl={BACKEND_URL}
                  fileId={currentFileId}
                  fileData={fileData}
                  onSettingsChange={setQaQcSettings}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please upload and select a file first
                </div>
              )}
            </TabsContent>

            <TabsContent value="inversion" className="space-y-4">
              {currentFileId ? (
                <InversionInterface 
                  backendUrl={BACKEND_URL}
                  fileId={currentFileId}
                  fileData={fileData}
                  qaQcSettings={qaQcSettings}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please upload and select a file first
                </div>
              )}
            </TabsContent>

            <TabsContent value="bert" className="space-y-4">
              {currentFileId ? (
                <BertInterface 
                  backendUrl={BACKEND_URL}
                  fileId={currentFileId}
                  fileData={fileData}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please upload and select a file first
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </BrowserRouter>
    </div>
  );
}

export default App;