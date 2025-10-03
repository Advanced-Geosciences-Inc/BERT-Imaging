import React, { useState, useRef, useEffect } from "react";
import { Play, Settings, Download, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

export default function InversionInterface({ backendUrl, fileId, fileData }) {
  const [inversionParams, setInversionParams] = useState({
    spacing: 1.0,
    lambda: 20.0,
    quality: 34,
    maxIter: 20,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [inversionResults, setInversionResults] = useState(null);
  const [displayOptions, setDisplayOptions] = useState({
    colormap: 'viridis',
    showElectrodes: true,
    showMesh: false,
    logScale: true,
  });

  const pseudosectionRef = useRef(null);
  const modelRef = useRef(null);
  const misfitRef = useRef(null);

  const runInversion = async () => {
    if (!fileId) return;

    setIsRunning(true);
    try {
      const response = await fetch(
        `${backendUrl}/api/ert/invert/${fileId}?` + 
        new URLSearchParams({
          spacing: inversionParams.spacing.toString(),
          lam: inversionParams.lambda.toString(),
          quality: inversionParams.quality.toString(),
          maxIter: inversionParams.maxIter.toString(),
        }), {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error(`Inversion failed: ${response.status}`);
      }

      const result = await response.json();
      setInversionResults(result);

      // Render the three plots
      await renderPlots(result);

    } catch (error) {
      console.error('Inversion failed:', error);
      alert(`Inversion failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const renderPlots = async (results) => {
    try {
      // Fetch all required CSV files
      const [trianglesResponse, modelResponse, nodesResponse] = await Promise.all([
        fetch(`${backendUrl}${results.files.triangles}`),
        fetch(`${backendUrl}${results.files.model_cells}`),
        fetch(`${backendUrl}${results.files.mesh_nodes}`)
      ]);

      if (!trianglesResponse.ok || !modelResponse.ok || !nodesResponse.ok) {
        throw new Error('Failed to fetch mesh data');
      }

      const trianglesData = parseCSV(await trianglesResponse.text());
      const modelData = parseCSV(await modelResponse.text());
      const nodesData = parseCSV(await nodesResponse.text());

      // Render each plot with the fetched data
      renderPseudosection(trianglesData, results);
      renderResistivityModel(trianglesData, modelData, nodesData, results);
      renderMisfit(trianglesData, results);

    } catch (error) {
      console.error('Failed to render plots:', error);
      // Render placeholder plots if data fetch fails
      renderPlaceholderPlots(results);
    }
  };

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((header, i) => {
        row[header.trim()] = parseFloat(values[i]) || 0;
      });
      return row;
    });
  };

  const renderPseudosection = (data) => {
    const canvas = pseudosectionRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const height = canvas.height = 300 * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);

    // Simple pseudosection rendering - simulate apparent resistivity data
    const nElec = Math.sqrt(data.length) || 10;
    const spacing = inversionParams.spacing;

    ctx.fillStyle = '#4f46e5';
    ctx.font = '12px sans-serif';
    ctx.fillText('Pseudosection - Apparent Resistivity', 10, 20);
    
    // Draw electrode positions
    if (displayOptions.showElectrodes) {
      ctx.fillStyle = '#000';
      for (let i = 0; i < nElec; i++) {
        const x = 50 + i * 20;
        ctx.fillRect(x-1, 40, 2, 8);
        if (i % 5 === 0) {
          ctx.fillText(i.toString(), x-5, 35);
        }
      }
    }

    ctx.fillStyle = '#666';
    ctx.fillText('Distance (m)', width/2 - 30, height - 10);
    
    // Y-axis label
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Depth Level', -height/2, 15);
    ctx.restore();
  };

  const renderResistivityModel = (data) => {
    const canvas = modelRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const height = canvas.height = 300 * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);

    // Get color scale bounds
    const rhoValues = data.map(d => displayOptions.logScale ? Math.log10(d.rho || 1) : (d.rho || 1));
    const minRho = Math.min(...rhoValues);
    const maxRho = Math.max(...rhoValues);

    // Render triangles
    data.forEach(triangle => {
      const { x1, y1, x2, y2, x3, y3, rho } = triangle;
      
      if (isNaN(x1) || isNaN(y1) || isNaN(rho)) return;

      // Scale coordinates to canvas
      const scaleX = (width - 100) / 20; // Assuming 20m width
      const scaleY = (height - 80) / 10; // Assuming 10m depth
      
      const sx1 = 50 + x1 * scaleX;
      const sy1 = 50 + Math.abs(y1) * scaleY;
      const sx2 = 50 + x2 * scaleX;
      const sy2 = 50 + Math.abs(y2) * scaleY;
      const sx3 = 50 + x3 * scaleX;
      const sy3 = 50 + Math.abs(y3) * scaleY;

      // Get color based on resistivity
      const normalizedRho = (displayOptions.logScale ? Math.log10(rho) : rho - minRho) / (maxRho - minRho);
      const color = getViridisColor(normalizedRho);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.lineTo(sx3, sy3);
      ctx.closePath();
      ctx.fill();

      if (displayOptions.showMesh) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    });

    // Labels
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('Resistivity Model', 10, 20);
    ctx.fillText('Distance (m)', width/2 - 30, height - 10);
    
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Depth (m)', -height/2, 15);
    ctx.restore();
  };

  const renderMisfit = (data) => {
    const canvas = misfitRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const height = canvas.height = 300 * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#4f46e5';
    ctx.font = '12px sans-serif';
    ctx.fillText('Data Misfit', 10, 20);

    if (inversionResults) {
      ctx.fillText(`χ² = ${inversionResults.chi2.toFixed(3)}`, 10, 40);
    }

    // Simulate misfit visualization
    ctx.fillStyle = '#666';
    ctx.fillText('Distance (m)', width/2 - 30, height - 10);
    
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Depth Level', -height/2, 15);
    ctx.restore();
  };

  // Simple viridis colormap approximation
  const getViridisColor = (t) => {
    t = Math.max(0, Math.min(1, t));
    const colors = [
      [68, 1, 84],      // dark purple
      [59, 82, 139],    // blue
      [33, 144, 140],   // teal  
      [92, 200, 99],    // green
      [253, 231, 37]    // yellow
    ];
    
    const scaled = t * (colors.length - 1);
    const idx = Math.floor(scaled);
    const frac = scaled - idx;
    
    if (idx >= colors.length - 1) return `rgb(${colors[colors.length - 1].join(',')})`;
    
    const c1 = colors[idx];
    const c2 = colors[idx + 1];
    const r = Math.round(c1[0] + frac * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + frac * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + frac * (c2[2] - c1[2]));
    
    return `rgb(${r},${g},${b})`;
  };

  useEffect(() => {
    // Redraw plots when display options change
    if (inversionResults) {
      renderPlots(inversionResults);
    }
  }, [displayOptions, inversionResults]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ERT Inversion</h2>
          <p className="text-gray-600">Configure parameters and run resistivity inversion</p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {fileData?.name}
        </Badge>
      </div>

      {/* Inversion Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Inversion Parameters
          </CardTitle>
          <CardDescription>
            Configure the inversion algorithm settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Electrode Spacing (m)
              </label>
              <Slider
                value={[inversionParams.spacing]}
                onValueChange={([value]) => 
                  setInversionParams(prev => ({ ...prev, spacing: value }))
                }
                min={0.1}
                max={10}
                step={0.1}
                className="w-full"
                data-testid="spacing-slider"
              />
              <div className="text-center text-sm text-gray-500">
                {inversionParams.spacing.toFixed(1)} m
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Lambda (λ)
              </label>
              <Slider
                value={[inversionParams.lambda]}
                onValueChange={([value]) => 
                  setInversionParams(prev => ({ ...prev, lambda: value }))
                }
                min={1}
                max={100}
                step={1}
                className="w-full"
                data-testid="lambda-slider"
              />
              <div className="text-center text-sm text-gray-500">
                {inversionParams.lambda.toFixed(0)}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Mesh Quality
              </label>
              <Slider
                value={[inversionParams.quality]}
                onValueChange={([value]) => 
                  setInversionParams(prev => ({ ...prev, quality: value }))
                }
                min={30}
                max={40}
                step={1}
                className="w-full"
                data-testid="quality-slider"
              />
              <div className="text-center text-sm text-gray-500">
                {inversionParams.quality}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Max Iterations
              </label>
              <Slider
                value={[inversionParams.maxIter]}
                onValueChange={([value]) => 
                  setInversionParams(prev => ({ ...prev, maxIter: value }))
                }
                min={5}
                max={50}
                step={1}
                className="w-full"
                data-testid="iterations-slider"
              />
              <div className="text-center text-sm text-gray-500">
                {inversionParams.maxIter}
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button
                onClick={runInversion}
                disabled={isRunning || !fileId}
                className="flex items-center gap-2"
                data-testid="run-inversion-btn"
              >
                {isRunning ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isRunning ? 'Running...' : 'Run Inversion'}
              </Button>

              {inversionResults && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  χ² = {inversionResults.chi2.toFixed(3)}
                </Badge>
              )}
            </div>

            {inversionResults && (
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Display Options */}
      {inversionResults && (
        <Card>
          <CardHeader>
            <CardTitle>Display Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-electrodes"
                  checked={displayOptions.showElectrodes}
                  onCheckedChange={(checked) =>
                    setDisplayOptions(prev => ({ ...prev, showElectrodes: checked }))
                  }
                />
                <label htmlFor="show-electrodes" className="text-sm font-medium">
                  Show Electrodes
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-mesh"
                  checked={displayOptions.showMesh}
                  onCheckedChange={(checked) =>
                    setDisplayOptions(prev => ({ ...prev, showMesh: checked }))
                  }
                />
                <label htmlFor="show-mesh" className="text-sm font-medium">
                  Show Mesh
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="log-scale"
                  checked={displayOptions.logScale}
                  onCheckedChange={(checked) =>
                    setDisplayOptions(prev => ({ ...prev, logScale: checked }))
                  }
                />
                <label htmlFor="log-scale" className="text-sm font-medium">
                  Log Scale
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Colormap:</label>
                <Select
                  value={displayOptions.colormap}
                  onValueChange={(value) =>
                    setDisplayOptions(prev => ({ ...prev, colormap: value }))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viridis">Viridis</SelectItem>
                    <SelectItem value="plasma">Plasma</SelectItem>
                    <SelectItem value="inferno">Inferno</SelectItem>
                    <SelectItem value="magma">Magma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Plots - EarthImager 2D Style (3 rows) */}
      {inversionResults && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Inversion Results</h3>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pseudosection - Apparent Resistivity</CardTitle>
            </CardHeader>
            <CardContent>
              <canvas
                ref={pseudosectionRef}
                className="w-full border border-gray-200 rounded"
                style={{ height: '300px' }}
                data-testid="pseudosection-plot"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resistivity Model</CardTitle>
            </CardHeader>
            <CardContent>
              <canvas
                ref={modelRef}
                className="w-full border border-gray-200 rounded"
                style={{ height: '300px' }}
                data-testid="resistivity-model-plot"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Misfit</CardTitle>
            </CardHeader>
            <CardContent>
              <canvas
                ref={misfitRef}
                className="w-full border border-gray-200 rounded"
                style={{ height: '300px' }}
                data-testid="misfit-plot"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}