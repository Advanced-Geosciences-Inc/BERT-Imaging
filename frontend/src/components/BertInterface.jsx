import React, { useState, useEffect } from "react";
import { Play, Settings, Download, Zap, AlertCircle, CheckCircle, FileText, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BertInterface({ backendUrl, fileId, fileData }) {
  const [bertConfig, setBertConfig] = useState({
    dimension: 2,
    topography: false,
    paradx: 0.2,
    para2dquality: 33.0,
    lambda_reg: 20.0,
    zweight: 0.3,
    constraint: 1,
    blocky_model: false,
    robust_data: false,
  });
  
  const [surveyInfo, setSurveyInfo] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [inversionResult, setInversionResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileId || !fileData) return;

    const loadSurveyInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${backendUrl}/api/bert/survey-info/${fileId}`);
        
        if (response.ok) {
          const data = await response.json();
          setSurveyInfo(data.survey_info);
          setBertConfig(prev => ({
            ...prev,
            ...data.recommended_config
          }));
        }
      } catch (error) {
        console.error('Failed to load survey info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSurveyInfo();
  }, [fileId, fileData, backendUrl]);

  const runBertInversion = async () => {
    if (!fileId) return;

    setIsRunning(true);
    try {
      const response = await fetch(`${backendUrl}/api/bert/run-inversion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          ...bertConfig
        }),
      });

      if (!response.ok) {
        throw new Error(`Inversion failed: ${response.status}`);
      }

      const result = await response.json();
      setInversionResult(result);

    } catch (error) {
      console.error('BERT inversion failed:', error);
      setInversionResult({
        success: false,
        error: error.message,
        plots: {}
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Analyzing survey configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">BERT Native Inversion</h2>
          <p className="text-gray-600">Configure parameters and run BERT inversion engine</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-3 py-1">
            {fileData?.name}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config" data-testid="bert-config-tab">Configuration</TabsTrigger>
          <TabsTrigger 
            value="results" 
            disabled={!inversionResult}
            data-testid="bert-results-tab"
          >
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          {/* Survey Information */}
          {surveyInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Survey Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Type</span>
                    <p className="text-lg font-semibold">{surveyInfo.survey_type?.replace('_', ' ').toUpperCase()}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Dimension</span>
                    <p className="text-lg font-semibold">{surveyInfo.dimension}D</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Electrodes</span>
                    <p className="text-lg font-semibold">{fileData?.inspectData?.n_electrodes || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Readings</span>
                    <p className="text-lg font-semibold">{fileData?.inspectData?.n_readings || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* BERT Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                BERT Parameters
              </CardTitle>
              <CardDescription>
                Configure inversion and mesh generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Survey Configuration */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900">Survey Configuration</h4>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="topography"
                      checked={bertConfig.topography}
                      onCheckedChange={(checked) =>
                        setBertConfig(prev => ({ ...prev, topography: checked }))
                      }
                    />
                    <label htmlFor="topography" className="text-sm font-medium">
                      Include Topography
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Mesh Cell Size Factor
                    </label>
                    <Slider
                      value={[bertConfig.paradx]}
                      onValueChange={([value]) => 
                        setBertConfig(prev => ({ ...prev, paradx: value }))
                      }
                      min={0.05}
                      max={0.5}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="text-center text-xs text-gray-500">
                      {bertConfig.paradx.toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Mesh Quality
                    </label>
                    <Slider
                      value={[bertConfig.para2dquality]}
                      onValueChange={([value]) => 
                        setBertConfig(prev => ({ ...prev, para2dquality: value }))
                      }
                      min={30}
                      max={35}
                      step={0.5}
                      className="w-full"
                    />
                    <div className="text-center text-xs text-gray-500">
                      {bertConfig.para2dquality.toFixed(1)}
                    </div>
                  </div>
                </div>

                {/* Inversion Parameters */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900">Inversion Parameters</h4>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Lambda (Regularization)
                    </label>
                    <Slider
                      value={[bertConfig.lambda_reg]}
                      onValueChange={([value]) => 
                        setBertConfig(prev => ({ ...prev, lambda_reg: value }))
                      }
                      min={1}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="text-center text-xs text-gray-500">
                      {bertConfig.lambda_reg.toFixed(0)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Z-Weight (Vertical Smoothing)
                    </label>
                    <Slider
                      value={[bertConfig.zweight]}
                      onValueChange={([value]) => 
                        setBertConfig(prev => ({ ...prev, zweight: value }))
                      }
                      min={0.1}
                      max={1.0}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="text-center text-xs text-gray-500">
                      {bertConfig.zweight.toFixed(1)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="blocky-model"
                      checked={bertConfig.blocky_model}
                      onCheckedChange={(checked) =>
                        setBertConfig(prev => ({ ...prev, blocky_model: checked }))
                      }
                    />
                    <label htmlFor="blocky-model" className="text-sm font-medium">
                      Blocky Model (L1 norm)
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="robust-data"
                      checked={bertConfig.robust_data}
                      onCheckedChange={(checked) =>
                        setBertConfig(prev => ({ ...prev, robust_data: checked }))
                      }
                    />
                    <label htmlFor="robust-data" className="text-sm font-medium">
                      Robust Data Fitting
                    </label>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  BERT will process {fileData?.inspectData?.n_readings || 0} resistivity measurements
                </div>
                <Button 
                  onClick={runBertInversion}
                  disabled={isRunning || !fileId}
                  className="flex items-center gap-2"
                  data-testid="run-bert-btn"
                >
                  {isRunning ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isRunning ? 'Running BERT...' : 'Run BERT Inversion'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {inversionResult && (
            <>
              {/* Results Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {inversionResult.success ? 
                      <CheckCircle className="h-5 w-5 text-green-500" /> :
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    }
                    Inversion Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!inversionResult.success ? (
                    <Alert className="border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-red-700">
                        {inversionResult.error || 'Inversion failed'}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <span className="text-sm font-medium text-gray-600">Status</span>
                          <p className="text-lg font-semibold text-green-600">Success</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-600">Job ID</span>
                          <p className="text-sm font-mono">{inversionResult.job_id}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-600">Plots Generated</span>
                          <p className="text-lg font-semibold">{Object.keys(inversionResult.plots).length}</p>
                        </div>
                        <div>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export Results
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* BERT Plots Display */}
              {inversionResult.success && Object.keys(inversionResult.plots).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">BERT Generated Plots</h3>
                  
                  {Object.entries(inversionResult.plots).map(([plotType, plotPath]) => (
                    <Card key={plotType}>
                      <CardHeader>
                        <CardTitle className="text-base capitalize">
                          {plotType.replace('_', ' ')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="border border-gray-200 rounded-lg p-4">
                          <img
                            src={`${backendUrl}/api/bert/plots/${inversionResult.job_id}/${plotType}`}
                            alt={`BERT ${plotType} plot`}
                            className="w-full h-auto max-h-96 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'block';
                            }}
                          />
                          <div className="text-center text-gray-500 py-8" style={{display: 'none'}}>
                            Plot not available: {plotType}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* BERT Output Log */}
              {inversionResult.output && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">BERT Output Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-64 font-mono">
                      {inversionResult.output}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}