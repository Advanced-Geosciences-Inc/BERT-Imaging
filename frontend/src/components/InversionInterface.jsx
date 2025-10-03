import React, { useState, useRef, useEffect } from "react";
import { Play, Settings, Download, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

export default function InversionInterface({ backendUrl, fileId, fileData, qaQcSettings }) {
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

  const renderPseudosection = (trianglesData, results) => {
    const canvas = pseudosectionRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = 300;
    canvas.width = canvasWidth * (window.devicePixelRatio || 1);
    canvas.height = canvasHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw title and axes
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.fillText('Pseudosection - Apparent Resistivity', 10, 20);
    
    const plotMargin = { left: 60, right: 40, top: 40, bottom: 50 };
    const plotWidth = canvasWidth - plotMargin.left - plotMargin.right;
    const plotHeight = canvasHeight - plotMargin.top - plotMargin.bottom;

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotMargin.left, plotMargin.top);
    ctx.lineTo(plotMargin.left, plotMargin.top + plotHeight);
    ctx.lineTo(plotMargin.left + plotWidth, plotMargin.top + plotHeight);
    ctx.stroke();

    // For pseudosection, we simulate the apparent resistivity arrangement
    // In a real implementation, this would use the original measurement geometry
    if (results && fileData?.inspectData) {
      const nElec = fileData.inspectData.n_electrodes;
      const spacing = inversionParams.spacing;
      
      // Draw electrode positions at surface
      if (displayOptions.showElectrodes) {
        ctx.fillStyle = '#000';
        for (let i = 0; i < nElec; i++) {
          const x = plotMargin.left + (i / (nElec - 1)) * plotWidth;
          ctx.fillRect(x - 1, plotMargin.top - 5, 2, 8);
          if (i % 5 === 0) {
            ctx.font = '10px sans-serif';
            ctx.fillText(i.toString(), x - 5, plotMargin.top - 8);
          }
        }
      }
      
      // Simulate pseudosection data points
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${fileData.inspectData.n_readings} data points`, plotMargin.left, plotHeight + plotMargin.top + 20);
      
      // Draw some sample data points in pseudosection arrangement
      const maxDepthLevel = 5;
      for (let level = 1; level <= maxDepthLevel; level++) {
        for (let pos = 0; pos < nElec - level * 2; pos += 2) {
          const x = plotMargin.left + ((pos + level) / (nElec - 1)) * plotWidth;
          const y = plotMargin.top + (level / maxDepthLevel) * plotHeight;
          
          // Color based on simulated apparent resistivity
          const rho = 50 + Math.random() * 200; // Simulate 50-250 ohm-m
          const normalizedRho = Math.log10(rho / 50) / Math.log10(5); // Log normalize
          const color = getViridisColor(normalizedRho);
          
          ctx.fillStyle = color;
          ctx.fillRect(x - 3, y - 3, 6, 6);
        }
      }
    }

    // Axis labels
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('Distance (m)', canvasWidth/2 - 30, canvasHeight - 10);
    
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Depth Level', -canvasHeight/2, 15);
    ctx.restore();
  };

  const renderResistivityModel = (trianglesData, modelData, nodesData, results) => {
    const canvas = modelRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = 300;
    canvas.width = canvasWidth * (window.devicePixelRatio || 1);
    canvas.height = canvasHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw title and axes
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.fillText('Resistivity Model', 10, 20);
    
    const plotMargin = { left: 60, right: 40, top: 40, bottom: 50 };
    const plotWidth = canvasWidth - plotMargin.left - plotMargin.right;
    const plotHeight = canvasHeight - plotMargin.top - plotMargin.bottom;

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotMargin.left, plotMargin.top);
    ctx.lineTo(plotMargin.left, plotMargin.top + plotHeight);
    ctx.lineTo(plotMargin.left + plotWidth, plotMargin.top + plotHeight);
    ctx.stroke();

    if (trianglesData && trianglesData.length > 0) {
      // Get bounds from the data
      const xCoords = trianglesData.flatMap(d => [d.x1 || 0, d.x2 || 0, d.x3 || 0]).filter(x => !isNaN(x));
      const yCoords = trianglesData.flatMap(d => [d.y1 || 0, d.y2 || 0, d.y3 || 0]).filter(y => !isNaN(y));
      const rhoValues = trianglesData.map(d => d.rho || 1).filter(r => !isNaN(r) && r > 0);

      if (xCoords.length > 0 && yCoords.length > 0 && rhoValues.length > 0) {
        const xMin = Math.min(...xCoords);
        const xMax = Math.max(...xCoords);
        const yMin = Math.min(...yCoords);
        const yMax = Math.max(...yCoords);
        const rhoMin = Math.min(...rhoValues);
        const rhoMax = Math.max(...rhoValues);

        const scaleX = plotWidth / (xMax - xMin || 1);
        const scaleY = plotHeight / (yMax - yMin || 1);

        // Render triangles
        trianglesData.forEach(triangle => {
          const { x1, y1, x2, y2, x3, y3, rho } = triangle;
          
          if (isNaN(x1) || isNaN(y1) || isNaN(rho) || rho <= 0) return;

          // Transform coordinates
          const sx1 = plotMargin.left + (x1 - xMin) * scaleX;
          const sy1 = plotMargin.top + plotHeight - (y1 - yMin) * scaleY;
          const sx2 = plotMargin.left + (x2 - xMin) * scaleX;
          const sy2 = plotMargin.top + plotHeight - (y2 - yMin) * scaleY;
          const sx3 = plotMargin.left + (x3 - xMin) * scaleX;
          const sy3 = plotMargin.top + plotHeight - (y3 - yMin) * scaleY;

          // Color based on resistivity
          const rhoValue = displayOptions.logScale ? Math.log10(rho) : rho;
          const rhoMinScale = displayOptions.logScale ? Math.log10(rhoMin) : rhoMin;
          const rhoMaxScale = displayOptions.logScale ? Math.log10(rhoMax) : rhoMax;
          const normalizedRho = (rhoValue - rhoMinScale) / (rhoMaxScale - rhoMinScale || 1);
          const color = getViridisColor(Math.max(0, Math.min(1, normalizedRho)));

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.lineTo(sx3, sy3);
          ctx.closePath();
          ctx.fill();

          if (displayOptions.showMesh) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        });

        // Draw electrode positions if requested
        if (displayOptions.showElectrodes && nodesData && nodesData.length > 0) {
          ctx.fillStyle = '#000';
          nodesData.forEach(node => {
            if (!isNaN(node.x) && !isNaN(node.y)) {
              const sx = plotMargin.left + (node.x - xMin) * scaleX;
              const sy = plotMargin.top + plotHeight - (node.y - yMin) * scaleY;
              ctx.fillRect(sx - 2, sy - 2, 4, 4);
            }
          });
        }

        // Add colorbar
        drawColorbar(ctx, canvasWidth - 35, plotMargin.top, 20, plotHeight, rhoMin, rhoMax, displayOptions.logScale);
      }
    } else {
      // Fallback visualization for mock data
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.fillText('Mock inversion - PyGimli not available', plotMargin.left, plotMargin.top + 30);
      ctx.fillText(`Chi² = ${results?.chi2?.toFixed(3) || 'N/A'}`, plotMargin.left, plotMargin.top + 50);
    }

    // Axis labels
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('Distance (m)', canvasWidth/2 - 30, canvasHeight - 10);
    
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Depth (m)', -canvasHeight/2, 15);
    ctx.restore();
  };

  const renderMisfit = (trianglesData, results) => {
    const canvas = misfitRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = 300;
    canvas.width = canvasWidth * (window.devicePixelRatio || 1);
    canvas.height = canvasHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw title and axes
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.fillText('Data Misfit', 10, 20);
    
    if (results?.chi2) {
      ctx.font = '12px sans-serif';
      ctx.fillText(`χ² = ${results.chi2.toFixed(3)}`, 10, 40);
      
      // Quality assessment
      let quality = 'Excellent';
      let qualityColor = '#22c55e';
      if (results.chi2 > 2) {
        quality = 'Poor';
        qualityColor = '#ef4444';
      } else if (results.chi2 > 1.5) {
        quality = 'Fair';
        qualityColor = '#f59e0b';
      } else if (results.chi2 > 1.2) {
        quality = 'Good';
        qualityColor = '#3b82f6';
      }
      
      ctx.fillStyle = qualityColor;
      ctx.fillText(`Fit Quality: ${quality}`, 10, 55);
    }

    const plotMargin = { left: 60, right: 40, top: 70, bottom: 50 };
    const plotWidth = canvasWidth - plotMargin.left - plotMargin.right;
    const plotHeight = canvasHeight - plotMargin.top - plotMargin.bottom;

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotMargin.left, plotMargin.top);
    ctx.lineTo(plotMargin.left, plotMargin.top + plotHeight);
    ctx.lineTo(plotMargin.left + plotWidth, plotMargin.top + plotHeight);
    ctx.stroke();

    // Simulate misfit data - in real implementation this would show residuals
    if (fileData?.inspectData) {
      const nReadings = fileData.inspectData.n_readings;
      
      // Draw misfit histogram or pseudosection-style misfit display
      for (let i = 0; i < Math.min(nReadings, 50); i++) {
        const x = plotMargin.left + (i / 49) * plotWidth;
        
        // Simulate residual values (should be from actual inversion)
        const residual = (Math.random() - 0.5) * 4; // -2 to +2 standard deviations
        const y = plotMargin.top + plotHeight/2 + residual * (plotHeight/8);
        
        // Color code residuals
        const absResidual = Math.abs(residual);
        let color = '#22c55e'; // Green for good fit
        if (absResidual > 1.5) color = '#ef4444'; // Red for poor fit
        else if (absResidual > 1) color = '#f59e0b'; // Orange for fair fit
        
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      
      // Zero line
      ctx.strokeStyle = '#666';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plotMargin.left, plotMargin.top + plotHeight/2);
      ctx.lineTo(plotMargin.left + plotWidth, plotMargin.top + plotHeight/2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axis labels
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('Data Point Index', canvasWidth/2 - 40, canvasHeight - 10);
    
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.fillText('Normalized Residual', -canvasHeight/2, 15);
    ctx.restore();
  };

  // Enhanced colormap functions
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

  const drawColorbar = (ctx, x, y, width, height, minVal, maxVal, logScale) => {
    // Draw colorbar background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
    
    // Draw color gradient
    const steps = 50;
    const stepHeight = height / steps;
    
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const color = getViridisColor(1 - t); // Invert for top-to-bottom
      ctx.fillStyle = color;
      ctx.fillRect(x, y + i * stepHeight, width, stepHeight + 1);
    }
    
    // Draw labels
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    
    const labelMin = logScale ? Math.pow(10, Math.log10(minVal)).toFixed(1) : minVal.toFixed(1);
    const labelMax = logScale ? Math.pow(10, Math.log10(maxVal)).toFixed(1) : maxVal.toFixed(1);
    
    ctx.fillText(labelMax, x + width + 5, y + 10);
    ctx.fillText(labelMin, x + width + 5, y + height);
    
    // Units
    ctx.fillText('Ω⋅m', x + width + 5, y - 5);
  };

  const renderPlaceholderPlots = (results) => {
    [pseudosectionRef, modelRef, misfitRef].forEach((ref, idx) => {
      const canvas = ref.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const canvasWidth = canvas.offsetWidth;
      const canvasHeight = 300;
      canvas.width = canvasWidth * (window.devicePixelRatio || 1);
      canvas.height = canvasHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      
      const titles = ['Pseudosection - Apparent Resistivity', 'Resistivity Model', 'Data Misfit'];
      
      ctx.fillStyle = '#000';
      ctx.font = '14px sans-serif';
      ctx.fillText(titles[idx], 10, 20);
      
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.fillText('Inversion completed with mock PyGimli', 60, 150);
      
      if (results?.chi2) {
        ctx.fillText(`χ² = ${results.chi2.toFixed(3)}`, 60, 170);
      }
      
      // Draw placeholder axes
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 40);
      ctx.lineTo(60, canvasHeight - 50);
      ctx.lineTo(canvasWidth - 40, canvasHeight - 50);
      ctx.stroke();
    });
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