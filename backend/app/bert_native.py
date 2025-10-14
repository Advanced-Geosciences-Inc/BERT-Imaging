"""
BERT Native Integration
Handles CFG file generation, BERT CLI execution, and plot management
"""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
import uuid
from datetime import datetime

@dataclass
class BertConfig:
    """BERT Configuration Parameters for 2D Surveys"""
    # Mandatory
    datafile: str
    
    # Survey Configuration
    dimension: int = 2
    topography: bool = False
    
    # Mesh Parameters
    paradx: float = 0.2        # Parameter mesh cell size factor
    para2dquality: float = 33.0  # Triangle quality for parameter mesh
    paradepth: float = 1.0     # Parameter domain depth factor
    paraboundary: float = 2.0  # Parameter boundary extension
    
    # Primary Mesh Parameters  
    primdx: float = 0.1        # Primary mesh cell size factor
    prim2dquality: float = 34.0  # Triangle quality for primary mesh
    
    # Inversion Parameters
    lambda_reg: float = 20.0   # Regularization parameter
    zweight: float = 0.3       # Anisotropic regularization (vertical weighting)
    constraint: int = 1        # Smoothness constraint (0=min length, 1=1st order, 2=2nd order)
    
    # Advanced Options
    blocky_model: bool = False  # L1 norm minimization for blocky models
    robust_data: bool = False   # Robust data fitting
    
    # Error Estimation
    input_err_level: float = 0.03   # Relative error level (3%)
    input_err_voltage: float = 1e-5  # Absolute voltage error (µV)
    
    # Output Options
    save_result: bool = True
    create_pdf: bool = True

class BertRunner:
    """Handles BERT execution and result management"""
    
    def __init__(self, work_dir: Path, bert_executable: str = None):
        self.work_dir = Path(work_dir)
        
        # Use mock BERT for testing if real BERT not available
        if bert_executable is None:
            mock_bert = Path(__file__).parent.parent / "bert_mock.py"
            if mock_bert.exists():
                self.bert_executable = f"python3 {mock_bert}"
            else:
                self.bert_executable = "bert"  # Try real BERT
        else:
            self.bert_executable = bert_executable
            
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
    def generate_cfg_file(self, config: BertConfig, cfg_path: Path) -> None:
        """Generate BERT CFG file from configuration"""
        
        cfg_content = f"""# BERT 2D ERT Configuration
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

# === Mandatory Parameters ===
DATAFILE={config.datafile}

# === Survey Configuration ===
DIMENSION={config.dimension}
TOPOGRAPHY={1 if config.topography else 0}

# === Parameter Mesh Settings ===
PARADX={config.paradx}
PARA2DQUALITY={config.para2dquality}
PARADEPTH={config.paradepth}
PARABOUNDARY={config.paraboundary}

# === Primary Mesh Settings ===
PRIMDX={config.primdx}
PRIM2DQUALITY={config.prim2dquality}

# === Inversion Parameters ===
LAMBDA={config.lambda_reg}
ZWEIGHT={config.zweight}
CONSTRAINT={config.constraint}

# === Advanced Options ===
BLOCKYMODEL={1 if config.blocky_model else 0}
ROBUSTDATA={1 if config.robust_data else 0}

# === Error Estimation ===
INPUTERRLEVEL={config.input_err_level}
INPUTERRVOLTAGE={config.input_err_voltage}

# === Output Options ===
SAVERESULT={1 if config.save_result else 0}
"""
        
        cfg_path.write_text(cfg_content)
        
    def execute_bert(self, cfg_file: Path, commands: List[str] = None) -> Dict[str, Any]:
        """Execute BERT with given configuration"""
        
        if commands is None:
            commands = ["all"]  # Default: full processing
            
        result = {
            "success": False,
            "output": "",
            "error": "",
            "generated_files": [],
            "plots": {}
        }
        
        try:
            # Change to work directory for BERT execution
            original_dir = os.getcwd()
            os.chdir(self.work_dir)
            
            # Execute BERT commands
            for cmd in commands:
                if self.bert_executable.startswith("python3"):
                    # For mock BERT
                    bert_cmd = self.bert_executable.split() + [str(cfg_file), cmd]
                else:
                    # For real BERT
                    bert_cmd = [self.bert_executable, str(cfg_file), cmd]
                
                process = subprocess.run(
                    bert_cmd,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minute timeout
                )
                
                result["output"] += f"Command: {' '.join(bert_cmd)}\n"
                result["output"] += process.stdout + "\n"
                
                if process.returncode != 0:
                    result["error"] += f"Error in command {cmd}: {process.stderr}\n"
                    return result
                    
            # Scan for generated plots
            result["plots"] = self.find_generated_plots()
            result["generated_files"] = list(self.work_dir.glob("*"))
            result["success"] = True
            
        except subprocess.TimeoutExpired:
            result["error"] = "BERT execution timed out"
        except Exception as e:
            result["error"] = f"Execution failed: {str(e)}"
        finally:
            os.chdir(original_dir)
            
        return result
    
    def find_generated_plots(self) -> Dict[str, str]:
        """Find and categorize generated plot files"""
        plots = {}
        
        # Look for common BERT output plot files
        plot_patterns = {
            "resistivity_model": ["*resistivity*.png", "*result*.png", "*model*.png"],
            "pseudosection": ["*pseudosection*.png", "*data*.png", "*apparent*.png"],
            "misfit": ["*misfit*.png", "*fit*.png", "*error*.png"],
            "mesh": ["*mesh*.png", "*grid*.png"],
            "convergence": ["*convergence*.png", "*chi*.png"]
        }
        
        for plot_type, patterns in plot_patterns.items():
            for pattern in patterns:
                matches = list(self.work_dir.glob(pattern))
                if matches:
                    # Take the first match for each type
                    plots[plot_type] = str(matches[0])
                    break
                    
        return plots
    
    def generate_plots(self, cfg_file: Path) -> Dict[str, Any]:
        """Generate specific plots using BERT show commands"""
        
        plot_commands = [
            "show",        # Resistivity model
            "showdata",    # Apparent resistivity pseudosection  
            "showfit",     # Data fit and misfit
            "showmesh",    # Parameter mesh
            "mkpdf"        # Generate PDF versions
        ]
        
        return self.execute_bert(cfg_file, plot_commands)

class BertWorkflowManager:
    """High-level BERT workflow management"""
    
    def __init__(self, base_work_dir: Path):
        self.base_work_dir = Path(base_work_dir)
        self.base_work_dir.mkdir(parents=True, exist_ok=True)
        
    def create_job(self, file_id: str) -> Path:
        """Create a new BERT job directory"""
        job_dir = self.base_work_dir / f"bert_job_{file_id}_{uuid.uuid4().hex[:8]}"
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir
        
    def run_bert_inversion(
        self, 
        stg_file_path: Path, 
        config: BertConfig,
        file_id: str
    ) -> Dict[str, Any]:
        """Complete BERT inversion workflow"""
        
        # Create job directory
        job_dir = self.create_job(file_id)
        
        # Copy STG file to job directory
        job_stg_path = job_dir / stg_file_path.name
        shutil.copy2(stg_file_path, job_stg_path)
        
        # Update config with local file path
        config.datafile = str(job_stg_path.name)
        
        # Create BERT runner
        runner = BertRunner(job_dir)
        
        # Generate CFG file
        cfg_path = job_dir / "bert_config.cfg"
        runner.generate_cfg_file(config, cfg_path)
        
        # Execute BERT
        result = runner.execute_bert(cfg_path)
        
        # Add job information to result
        result["job_dir"] = str(job_dir)
        result["cfg_file"] = str(cfg_path)
        result["config"] = config.__dict__
        
        return result

# Survey type detection helpers
def detect_survey_type(stg_file_path: Path) -> Dict[str, Any]:
    """Analyze STG file to suggest survey configuration"""
    
    # This would analyze the electrode positions to determine:
    # - 2D vs 3D layout
    # - Surface vs crosshole
    # - Topography presence
    # - Recommended mesh parameters
    
    # For now, return default 2D surface configuration
    return {
        "dimension": 2,
        "topography": False,
        "survey_type": "surface_2d",
        "electrode_count": 0,  # Would be determined from file
        "line_length": 0.0,    # Would be calculated
        "recommended_spacing": 1.0
    }

def get_default_config(survey_info: Dict[str, Any]) -> BertConfig:
    """Get default BERT configuration based on survey analysis"""
    
    return BertConfig(
        datafile="",  # Will be set by workflow manager
        dimension=survey_info.get("dimension", 2),
        topography=survey_info.get("topography", False),
        # Mesh parameters adjusted based on survey size
        paradx=min(0.3, max(0.1, survey_info.get("recommended_spacing", 1.0) * 0.2)),
        lambda_reg=20.0,  # Standard starting value
        zweight=0.3 if not survey_info.get("topography") else 0.1
    )