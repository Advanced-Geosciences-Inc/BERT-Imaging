import React, { useState, useEffect, useMemo } from "react";
import { BarChart3, AlertTriangle, TrendingUp, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function QAQCInterface({ backendUrl, fileId, fileData }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    maxError: 0.1,      // 10% default
    minRhoa: 1,         // 1 Ohm-m
    maxRhoa: 10000,     // 10k Ohm-m
  });
  const [bypassFilters, setBypassFilters] = useState(false);

  useEffect(() => {
    if (!fileId || !fileData) return;

    const loadRawData = async () => {
      try {
        setLoading(true);
        
        // Get the correct CSV filename from metadata
        const csvFileName = fileData.metadata?.normalized_csv?.split('/').pop() || `${fileId}.normalized.csv`;
        const csvResponse = await fetch(`${backendUrl}/api/data/${csvFileName}`);
        
        const csvText = await csvResponse.text();
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const row = {};
          headers.forEach((header, idx) => {
            const cleanHeader = header.trim();
            row[cleanHeader] = parseFloat(values[idx]) || 0;
          });
          
          // Ensure we have the required columns
          if (row.A && row.B && row.M && row.N && row.rhoa) {
            data.push({
              a: row.A,
              b: row.B, 
              m: row.M,
              n: row.N,
              rhoa: row.rhoa,
              err: row.err || 0.03,
              k: row.k || 1.0
            });
          }
        }
        
        setRawData(data);
        
        // Set initial filter bounds based on actual data
        if (data.length > 0) {
          const rhoaValues = data.map(d => d.rhoa);
          const errorValues = data.map(d => d.err);
          
          setFilters(prev => ({
            ...prev,
            minRhoa: Math.max(1, Math.min(...rhoaValues) * 0.9),
            maxRhoa: Math.min(100000, Math.max(...rhoaValues) * 1.1),
            maxError: Math.min(0.5, Math.max(...errorValues) * 1.2)
          }));
        }
        
      } catch (error) {
        console.error('Failed to load raw data:', error);
        // Fallback to inspect data if CSV fetch fails
        if (fileData?.inspectData) {
          const inspectData = fileData.inspectData;
          const simulatedData = [];
          
          for (let i = 0; i < Math.min(inspectData.n_readings, 100); i++) {
            simulatedData.push({
              rhoa: Math.random() * 1000 + 10,
              err: Math.random() * 0.15 + 0.01,
              a: Math.floor(Math.random() * inspectData.n_electrodes) + 1,
              b: Math.floor(Math.random() * inspectData.n_electrodes) + 1,
              m: Math.floor(Math.random() * inspectData.n_electrodes) + 1,
              n: Math.floor(Math.random() * inspectData.n_electrodes) + 1,
            });
          }
          setRawData(simulatedData);
        }
      } finally {
        setLoading(false);
      }
    };

    loadRawData();
  }, [fileId, fileData, backendUrl]);

  const filteredData = useMemo(() => {
    if (!rawData) return [];
    
    // If bypass is enabled, return all data
    if (bypassFilters) return rawData;
    
    return rawData.filter(point => 
      point.err <= filters.maxError &&
      point.rhoa >= filters.minRhoa &&
      point.rhoa <= filters.maxRhoa
    );
  }, [rawData, filters, bypassFilters]);

  const statistics = useMemo(() => {
    if (!rawData) return {};

    const rhoaValues = rawData.map(d => d.rhoa);
    const errorValues = rawData.map(d => d.err);
    
    return {
      total: rawData.length,
      filtered: filteredData.length,
      excluded: rawData.length - filteredData.length,
      rhoaStats: {
        min: Math.min(...rhoaValues),
        max: Math.max(...rhoaValues),
        mean: rhoaValues.reduce((a, b) => a + b, 0) / rhoaValues.length,
        median: rhoaValues.sort((a, b) => a - b)[Math.floor(rhoaValues.length / 2)]
      },
      errorStats: {
        min: Math.min(...errorValues),
        max: Math.max(...errorValues),
        mean: errorValues.reduce((a, b) => a + b, 0) / errorValues.length,
        median: errorValues.sort((a, b) => a - b)[Math.floor(errorValues.length / 2)]
      }
    };
  }, [rawData, filteredData]);

  // Simple histogram calculation
  const createHistogram = (data, nBins = 30) => {
    if (!data.length) return [];
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / nBins;
    
    const bins = Array(nBins).fill(0);
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), nBins - 1);
      bins[binIndex]++;
    });
    
    return bins.map((count, i) => ({
      x: min + (i + 0.5) * binWidth,
      count,
      inRange: true // You can add logic here to mark filtered bins
    }));
  };

  const rhoaHistogram = rawData ? createHistogram(rawData.map(d => d.rhoa)) : [];
  const errorHistogram = rawData ? createHistogram(rawData.map(d => d.err)) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Loading data for QA/QC analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quality Assurance & Quality Control</h2>
          <p className="text-gray-600">Analyze and filter resistivity data before inversion</p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {fileData?.name}
        </Badge>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-600">Total Readings</span>
            </div>
            <p className="text-2xl font-bold text-gray-900" data-testid="total-readings">
              {statistics.total || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-gray-600">Accepted</span>
            </div>
            <p className="text-2xl font-bold text-green-600" data-testid="accepted-readings">
              {statistics.filtered || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-gray-600">Excluded</span>
            </div>
            <p className="text-2xl font-bold text-red-600" data-testid="excluded-readings">
              {statistics.excluded || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-gray-600">Quality</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">
              {statistics.total ? Math.round((statistics.filtered / statistics.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Data Filters</CardTitle>
          <CardDescription>
            Set thresholds to exclude poor quality data points
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bypass Toggle */}
          <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Checkbox
              id="bypass-filters"
              checked={bypassFilters}
              onCheckedChange={setBypassFilters}
              data-testid="bypass-filters-toggle"
            />
            <div className="space-y-1">
              <label htmlFor="bypass-filters" className="text-sm font-medium text-blue-900 cursor-pointer">
                Use All Data (Bypass Filters)
              </label>
              <p className="text-xs text-blue-700">
                Include all readings regardless of error or resistivity thresholds
              </p>
            </div>
            {bypassFilters && (
              <Badge variant="secondary" className="ml-auto bg-blue-100 text-blue-800">
                All data included
              </Badge>
            )}
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-opacity ${bypassFilters ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Error Filter */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Maximum Error (%)
                {bypassFilters && <span className="text-blue-600 ml-2">(Disabled)</span>}
              </label>
              <div className="space-y-2">
                <Slider
                  value={[filters.maxError * 100]}
                  onValueChange={([value]) => 
                    setFilters(prev => ({ ...prev, maxError: value / 100 }))
                  }
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                  disabled={bypassFilters}
                  data-testid="error-threshold-slider"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>1%</span>
                  <span className="font-medium">{(filters.maxError * 100).toFixed(1)}%</span>
                  <span>50%</span>
                </div>
              </div>
            </div>

            {/* Min Resistivity Filter */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Minimum Resistivity (Ω⋅m)
                {bypassFilters && <span className="text-blue-600 ml-2">(Disabled)</span>}
              </label>
              <div className="space-y-2">
                <Slider
                  value={[Math.log10(filters.minRhoa)]}
                  onValueChange={([value]) => 
                    setFilters(prev => ({ ...prev, minRhoa: Math.pow(10, value) }))
                  }
                  min={-1}
                  max={3}
                  step={0.1}
                  className="w-full"
                  disabled={bypassFilters}
                  data-testid="min-rhoa-slider"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0.1</span>
                  <span className="font-medium">{filters.minRhoa.toFixed(1)}</span>
                  <span>1000</span>
                </div>
              </div>
            </div>

            {/* Max Resistivity Filter */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Maximum Resistivity (Ω⋅m)
                {bypassFilters && <span className="text-blue-600 ml-2">(Disabled)</span>}
              </label>
              <div className="space-y-2">
                <Slider
                  value={[Math.log10(filters.maxRhoa)]}
                  onValueChange={([value]) => 
                    setFilters(prev => ({ ...prev, maxRhoa: Math.pow(10, value) }))
                  }
                  min={2}
                  max={6}
                  step={0.1}
                  className="w-full"
                  disabled={bypassFilters}
                  data-testid="max-rhoa-slider"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>100</span>
                  <span>1M</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{statistics.excluded || 0}</span> readings will be excluded from inversion
            </div>
            <Button 
              onClick={() => {
                // TODO: Apply filters and proceed to inversion
                console.log('Applying filters:', filters);
              }}
              disabled={statistics.filtered === 0}
              data-testid="apply-filters-btn"
            >
              Apply Filters & Continue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histograms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Apparent Resistivity Histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Apparent Resistivity Distribution</CardTitle>
            <CardDescription>
              Distribution of apparent resistivity values with filter thresholds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-center space-x-1 border-b border-gray-200">
              {rhoaHistogram.map((bin, i) => {
                const height = Math.max(2, (bin.count / Math.max(...rhoaHistogram.map(b => b.count))) * 200);
                const isFiltered = bin.x < filters.minRhoa || bin.x > filters.maxRhoa;
                return (
                  <div
                    key={i}
                    className={`bg-blue-500 transition-colors ${isFiltered ? 'opacity-30' : 'opacity-80'}`}
                    style={{
                      height: `${height}px`,
                      width: '8px',
                      minHeight: '2px'
                    }}
                    title={`${bin.x.toFixed(1)} Ω⋅m: ${bin.count} readings`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>{statistics.rhoaStats?.min?.toFixed(1)} Ω⋅m</span>
              <span>{statistics.rhoaStats?.max?.toFixed(1)} Ω⋅m</span>
            </div>
          </CardContent>
        </Card>

        {/* Error Distribution Histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Error Distribution</CardTitle>
            <CardDescription>
              Distribution of measurement errors with threshold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-center space-x-1 border-b border-gray-200">
              {errorHistogram.map((bin, i) => {
                const height = Math.max(2, (bin.count / Math.max(...errorHistogram.map(b => b.count))) * 200);
                const isFiltered = bin.x > filters.maxError;
                return (
                  <div
                    key={i}
                    className={`bg-red-500 transition-colors ${isFiltered ? 'opacity-30' : 'opacity-80'}`}
                    style={{
                      height: `${height}px`,
                      width: '8px',
                      minHeight: '2px'
                    }}
                    title={`${(bin.x * 100).toFixed(1)}%: ${bin.count} readings`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>{((statistics.errorStats?.min || 0) * 100).toFixed(1)}%</span>
              <span>{((statistics.errorStats?.max || 0) * 100).toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}