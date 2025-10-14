#!/usr/bin/env python3
"""
Mock BERT executable for testing integration
This simulates BERT behavior until real BERT is available
"""

import sys
import os
import argparse
from pathlib import Path
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm
import matplotlib.patches as patches

def create_mock_plots(work_dir):
    """Create mock BERT-style plots"""
    work_path = Path(work_dir)
    
    # Create mock resistivity model plot
    fig, ax = plt.subplots(1, 1, figsize=(10, 6))
    
    # Mock triangular mesh resistivity model
    x = np.linspace(0, 50, 100)
    y = np.linspace(-20, 0, 50)
    X, Y = np.meshgrid(x, y)
    
    # Create synthetic resistivity distribution
    Z = 100 * np.exp(-((X-25)**2 + (Y+5)**2) / 200) + 50 + 20 * np.random.random(X.shape)
    
    im = ax.contourf(X, Y, Z, levels=20, cmap='viridis', norm=LogNorm(vmin=10, vmax=500))
    
    # Add electrodes
    electrode_positions = np.linspace(2, 48, 25)
    ax.scatter(electrode_positions, np.zeros_like(electrode_positions), 
               c='white', s=30, marker='v', edgecolors='black', zorder=5)
    
    ax.set_xlabel('Distance (m)')
    ax.set_ylabel('Depth (m)')
    ax.set_title('BERT 2D Resistivity Model')
    plt.colorbar(im, ax=ax, label='Resistivity (Ω⋅m)')
    
    plt.savefig(work_path / 'resistivity_model.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Create mock pseudosection
    fig, ax = plt.subplots(1, 1, figsize=(10, 6))
    
    # Mock apparent resistivity pseudosection
    n_levels = 6
    n_electrodes = 25
    rhoa_data = []
    x_pos = []
    y_pos = []
    
    for level in range(1, n_levels):
        for pos in range(n_electrodes - level * 2):
            x = (pos + level) * 2
            y = -level * 0.8
            rhoa = 80 + 40 * np.sin(x * 0.1) + np.random.normal(0, 10)
            
            rhoa_data.append(max(rhoa, 10))  # Minimum 10 ohm-m
            x_pos.append(x)
            y_pos.append(y)
    
    scatter = ax.scatter(x_pos, y_pos, c=rhoa_data, s=30, cmap='viridis', 
                        norm=LogNorm(vmin=10, vmax=200), alpha=0.8)
    
    ax.set_xlabel('Distance (m)')
    ax.set_ylabel('Depth Level')
    ax.set_title('Apparent Resistivity Pseudosection')
    plt.colorbar(scatter, ax=ax, label='Apparent Resistivity (Ω⋅m)')
    
    plt.savefig(work_path / 'pseudosection.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Create mock misfit plot
    fig, ax = plt.subplots(1, 1, figsize=(10, 6))
    
    # Mock misfit data
    misfit_data = np.random.normal(0, 2, len(rhoa_data))  # Normalized residuals
    
    scatter = ax.scatter(x_pos, y_pos, c=misfit_data, s=30, cmap='RdBu_r', 
                        vmin=-4, vmax=4, alpha=0.8)
    
    ax.set_xlabel('Distance (m)')
    ax.set_ylabel('Depth Level')
    ax.set_title('Data Misfit (Normalized Residuals)')
    plt.colorbar(scatter, ax=ax, label='Normalized Residual')
    
    plt.savefig(work_path / 'misfit.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Create mesh plot
    fig, ax = plt.subplots(1, 1, figsize=(10, 6))
    
    # Mock mesh visualization
    for i in range(0, 50, 2):
        for j in range(0, 20, 2):
            # Draw triangular elements
            triangle1 = patches.Polygon([(i, -j), (i+2, -j), (i+1, -(j+2))], 
                                       fill=False, edgecolor='gray', linewidth=0.5)
            triangle2 = patches.Polygon([(i+2, -j), (i+2, -(j+2)), (i+1, -(j+2))], 
                                       fill=False, edgecolor='gray', linewidth=0.5)
            ax.add_patch(triangle1)
            ax.add_patch(triangle2)
    
    ax.set_xlim(0, 50)
    ax.set_ylim(-20, 2)
    ax.set_xlabel('Distance (m)')
    ax.set_ylabel('Depth (m)')
    ax.set_title('Parameter Mesh')
    ax.set_aspect('equal')
    
    plt.savefig(work_path / 'mesh.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    print("Mock BERT plots generated successfully")

def main():
    if len(sys.argv) < 3:
        print("Usage: bert_mock.py <config_file> <command>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    command = sys.argv[2]
    
    work_dir = Path(config_file).parent
    
    print(f"Mock BERT executing command: {command}")
    print(f"Working directory: {work_dir}")
    print(f"Config file: {config_file}")
    
    # Simulate BERT processing
    if command in ['all', 'show', 'showdata', 'showfit', 'showmesh', 'mkpdf']:
        print("Generating mesh...")
        print("Calculating primary potentials...")
        print("Running inversion...")
        print("Chi-squared: 1.23")
        print("RMS: 0.054")
        
        # Create mock plots
        create_mock_plots(work_dir)
        
        print("Inversion completed successfully")
    else:
        print(f"Command {command} executed")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())