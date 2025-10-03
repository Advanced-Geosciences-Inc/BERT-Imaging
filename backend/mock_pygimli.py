"""
Mock PyGimli module for development when PyGimli isn't available
This provides the basic structure needed for the backend to function
"""
import numpy as np
from typing import List, Any, Dict

class Pos:
    def __init__(self, x: float, y: float, z: float = 0.0):
        self._x = float(x)
        self._y = float(y) 
        self._z = float(z)
    
    def x(self): return self._x
    def y(self): return self._y
    def z(self): return self._z
    def pos(self): return [self._x, self._y, self._z]

class Node:
    def __init__(self, pos: Pos, node_id: int = 0):
        self._pos = pos
        self._id = node_id
    
    def pos(self): return self._pos
    def id(self): return self._id

class Cell:
    def __init__(self, nodes: List[Node]):
        self._nodes = nodes
    
    def nodes(self): return self._nodes

class Mesh:
    def __init__(self):
        self._nodes = []
        self._cells = []
    
    def nodes(self): return self._nodes
    def cells(self): return self._cells
    def nodeCount(self): return len(self._nodes)
    def cellCount(self): return len(self._cells)
    def node(self, idx): return self._nodes[idx] if idx < len(self._nodes) else None

class DataContainerERT:
    def __init__(self):
        self._sensors = []
        self._data = {}
        self._size = 0
    
    def setSensorPositions(self, sensors: List[Pos]):
        self._sensors = sensors
    
    def createSensors(self, sensors: List[Pos]):
        self._sensors = sensors
    
    def sensorPositions(self): return self._sensors
    
    def resize(self, size: int):
        self._size = size
        
    def createFourPointData(self, i: int, a: int, b: int, m: int, n: int):
        if "a" not in self._data: self._data["a"] = []
        if "b" not in self._data: self._data["b"] = []  
        if "m" not in self._data: self._data["m"] = []
        if "n" not in self._data: self._data["n"] = []
        
        while len(self._data["a"]) <= i:
            self._data["a"].append(0)
            self._data["b"].append(0)
            self._data["m"].append(0)
            self._data["n"].append(0)
            
        self._data["a"][i] = a
        self._data["b"][i] = b
        self._data["m"][i] = m
        self._data["n"][i] = n
    
    def set(self, key: str, values):
        self._data[key] = np.asarray(values)
    
    def __getitem__(self, key):
        return self._data.get(key, [])

class Vector:
    def __init__(self, size: int, value: float = 0.0):
        self._data = np.full(size, value, dtype=float)
    
    def __len__(self): return len(self._data)
    def __getitem__(self, i): return self._data[i] 
    def __setitem__(self, i, v): self._data[i] = v

class MockInv:
    def chi2(self): return np.random.uniform(0.5, 2.0)

class ERTManager:
    def __init__(self, data=None, verbose=False):
        self.verbose = verbose
        self._data = data
        self.paraDomain = Mesh()
        self.inv = MockInv()
        
    def simulate(self, mesh=None, res=None, noiseLevel=0.0, noiseAbs=0.0, verbose=False):
        # Mock simulation - return dummy data
        if self._data:
            size = len(self._data._sensors) if hasattr(self._data, '_sensors') else 10
        else:
            size = 10
        return DataContainerERT()
        
    def invert(self, data=None, mesh=None, lam=20.0, quality=34.0, maxIter=20, verbose=False):
        # Mock inversion - return dummy resistivity model
        if mesh:
            n_cells = mesh.cellCount() if hasattr(mesh, 'cellCount') else 100
        else:
            n_cells = 100
        # Generate synthetic resistivity values
        return np.random.uniform(10, 1000, n_cells)

# Mock meshtools module
class meshtools:
    @staticmethod
    def createWorld(start=None, end=None, worldMarker=True):
        return MockMesh()
    
    @staticmethod  
    def createMesh(world, quality=34.0):
        return MockMesh()

class MockMesh(Mesh):
    def __init__(self):
        super().__init__()
        # Create dummy triangular mesh
        self._generate_dummy_mesh()
    
    def _generate_dummy_mesh(self):
        # Create a simple 10x5 triangular mesh for testing
        nx, ny = 11, 6
        
        # Generate nodes
        for j in range(ny):
            for i in range(nx):
                x = float(i)
                y = -float(j) * 0.5  # negative for depth
                pos = Pos(x, y)
                node = Node(pos, len(self._nodes))
                self._nodes.append(node)
        
        # Generate triangular cells 
        for j in range(ny-1):
            for i in range(nx-1):
                # Two triangles per quad
                n0 = j * nx + i
                n1 = j * nx + (i + 1)
                n2 = (j + 1) * nx + i  
                n3 = (j + 1) * nx + (i + 1)
                
                # Triangle 1
                cell1 = Cell([self._nodes[n0], self._nodes[n1], self._nodes[n2]])
                self._cells.append(cell1)
                
                # Triangle 2  
                cell2 = Cell([self._nodes[n1], self._nodes[n3], self._nodes[n2]])
                self._cells.append(cell2)

    def createNode(self, pos_list):
        pos = Pos(pos_list[0], pos_list[1], pos_list[2] if len(pos_list) > 2 else 0.0)
        node = Node(pos, len(self._nodes))
        self._nodes.append(node)
        return node

# Module level exports
__version__ = "1.5.3-mock"

def Vector(size, value=0.0):
    return Vector(size, value)

# Create physics submodule
class physics:
    class ert:
        ERTManager = ERTManager
        DataContainerERT = DataContainerERT

# Create meshtools as module attribute  
meshtools = meshtools()
physics = physics()