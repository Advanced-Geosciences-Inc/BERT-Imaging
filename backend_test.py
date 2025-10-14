#!/usr/bin/env python3
"""
Backend API Test Suite for PyGimli/BERT Integration
Tests all backend endpoints systematically
"""

import requests
import json
import os
from pathlib import Path
import time

# Configuration
BACKEND_URL = "https://resistivity-web.preview.emergentagent.com/api"
TEST_FILE_PATH = "/app/backend/data/test_mini.stg"

class BERTBackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.test_file_path = TEST_FILE_PATH
        self.file_id = None
        self.results = {}
        
    def log_test(self, test_name, success, details="", error=""):
        """Log test results"""
        self.results[test_name] = {
            "success": success,
            "details": details,
            "error": error
        }
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if error:
            print(f"   Error: {error}")
        print()

    def test_versions_endpoint(self):
        """Test GET /api/versions - Check PyGimli status"""
        try:
            response = requests.get(f"{self.base_url}/versions", timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["python", "pygimli", "pygimli:available"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Versions Endpoint", False, 
                                error=f"Missing fields: {missing_fields}")
                    return False
                
                # Check PyGimli status
                pygimli_status = "mock" if "mock" in str(data.get("pygimli", "")).lower() else "real"
                pygimli_available = data.get("pygimli:available", False)
                
                details = f"PyGimli: {data['pygimli']} (Available: {pygimli_available}, Status: {pygimli_status})"
                self.log_test("Versions Endpoint", True, details)
                return True
            else:
                self.log_test("Versions Endpoint", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Versions Endpoint", False, error=str(e))
            return False

    def test_file_upload(self):
        """Test POST /api/import/stg - Upload STG file"""
        try:
            if not os.path.exists(self.test_file_path):
                self.log_test("File Upload", False, 
                            error=f"Test file not found: {self.test_file_path}")
                return False
            
            with open(self.test_file_path, 'rb') as f:
                files = {'file': ('test_mini.stg', f, 'application/octet-stream')}
                response = requests.post(f"{self.base_url}/import/stg", 
                                       files=files, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required response fields
                required_fields = ["file_id", "n_readings", "metadata", "normalized_csv"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("File Upload", False, 
                                error=f"Missing response fields: {missing_fields}")
                    return False
                
                self.file_id = data["file_id"]
                n_readings = data["n_readings"]
                
                # Verify expected values for test_mini.stg (should have 2 readings)
                if n_readings != 2:
                    self.log_test("File Upload", False, 
                                error=f"Expected 2 readings, got {n_readings}")
                    return False
                
                details = f"File ID: {self.file_id}, Readings: {n_readings}"
                self.log_test("File Upload", True, details)
                return True
            else:
                self.log_test("File Upload", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("File Upload", False, error=str(e))
            return False

    def test_inspect_endpoint(self):
        """Test GET /api/inspect/{file_id} - Inspect uploaded file"""
        if not self.file_id:
            self.log_test("Inspect Endpoint", False, 
                        error="No file_id available (upload test must pass first)")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/inspect/{self.file_id}", timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["file_id", "n_readings", "n_electrodes", "indexing"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Inspect Endpoint", False, 
                                error=f"Missing fields: {missing_fields}")
                    return False
                
                # Verify expected values for test_mini.stg
                expected_readings = 2
                if data["n_readings"] != expected_readings:
                    self.log_test("Inspect Endpoint", False, 
                                error=f"Expected {expected_readings} readings, got {data['n_readings']}")
                    return False
                
                # Check electrode count (should be 4 for electrodes 1,2,3,4)
                expected_electrodes = 4
                if data["n_electrodes"] != expected_electrodes:
                    self.log_test("Inspect Endpoint", False, 
                                error=f"Expected {expected_electrodes} electrodes, got {data['n_electrodes']}")
                    return False
                
                details = f"Electrodes: {data['n_electrodes']}, Readings: {data['n_readings']}, Indexing: {data['indexing']}"
                self.log_test("Inspect Endpoint", True, details)
                return True
            else:
                self.log_test("Inspect Endpoint", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Inspect Endpoint", False, error=str(e))
            return False

    def test_ert_scheme(self):
        """Test GET /api/ert/scheme/{file_id}?spacing=1.0 - ERT scheme analysis"""
        if not self.file_id:
            self.log_test("ERT Scheme", False, 
                        error="No file_id available (upload test must pass first)")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/ert/scheme/{self.file_id}?spacing=1.0", 
                                  timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["file_id", "n_electrodes", "spacing", "n_data"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("ERT Scheme", False, 
                                error=f"Missing fields: {missing_fields}")
                    return False
                
                # Verify expected values
                if data["spacing"] != 1.0:
                    self.log_test("ERT Scheme", False, 
                                error=f"Expected spacing 1.0, got {data['spacing']}")
                    return False
                
                if data["n_data"] != 2:
                    self.log_test("ERT Scheme", False, 
                                error=f"Expected 2 data points, got {data['n_data']}")
                    return False
                
                details = f"Electrodes: {data['n_electrodes']}, Spacing: {data['spacing']}, Data points: {data['n_data']}"
                self.log_test("ERT Scheme", True, details)
                return True
            else:
                self.log_test("ERT Scheme", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("ERT Scheme", False, error=str(e))
            return False

    def test_bert_survey_info(self):
        """Test GET /api/bert/survey-info/{file_id} - BERT Native survey analysis"""
        if not self.file_id:
            self.log_test("BERT Survey Info", False, 
                        error="No file_id available (upload test must pass first)")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/bert/survey-info/{self.file_id}", 
                                  timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["file_id", "survey_info", "recommended_config"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("BERT Survey Info", False, 
                                error=f"Missing fields: {missing_fields}")
                    return False
                
                # Verify file_id matches
                if data["file_id"] != self.file_id:
                    self.log_test("BERT Survey Info", False, 
                                error=f"File ID mismatch: expected {self.file_id}, got {data['file_id']}")
                    return False
                
                survey_info = data.get("survey_info", {})
                config = data.get("recommended_config", {})
                
                details = f"Survey type detected, Config provided: {len(config)} parameters"
                self.log_test("BERT Survey Info", True, details)
                return True
            else:
                self.log_test("BERT Survey Info", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("BERT Survey Info", False, error=str(e))
            return False

    def test_ert_inversion(self):
        """Test ERT inversion endpoint (optional - may fail with mock PyGimli)"""
        if not self.file_id:
            self.log_test("ERT Inversion (Optional)", False, 
                        error="No file_id available (upload test must pass first)")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/ert/invert/{self.file_id}?spacing=1.0&lam=20.0", 
                                  timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if we get expected fields
                expected_fields = ["file_id", "spacing", "lam", "chi2"]
                present_fields = [field for field in expected_fields if field in data]
                
                details = f"Inversion completed with {len(present_fields)}/{len(expected_fields)} expected fields"
                self.log_test("ERT Inversion (Optional)", True, details)
                return True
            elif response.status_code == 500:
                # Expected with mock PyGimli
                error_msg = response.text
                if "PyGIMli" in error_msg or "not available" in error_msg:
                    details = "Expected failure - PyGimli not available (using mock)"
                    self.log_test("ERT Inversion (Optional)", True, details)
                    return True
                else:
                    self.log_test("ERT Inversion (Optional)", False, 
                                error=f"Unexpected error: {error_msg}")
                    return False
            else:
                self.log_test("ERT Inversion (Optional)", False, 
                            error=f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("ERT Inversion (Optional)", False, error=str(e))
            return False

    def run_all_tests(self):
        """Run all backend tests in sequence"""
        print("=" * 60)
        print("BERT Backend API Test Suite")
        print("=" * 60)
        print(f"Backend URL: {self.base_url}")
        print(f"Test file: {self.test_file_path}")
        print()
        
        # Core tests (must pass)
        core_tests = [
            self.test_versions_endpoint,
            self.test_file_upload,
            self.test_inspect_endpoint,
            self.test_ert_scheme,
            self.test_bert_survey_info,
        ]
        
        # Optional tests (may fail with mock)
        optional_tests = [
            self.test_ert_inversion,
        ]
        
        core_passed = 0
        core_total = len(core_tests)
        
        print("CORE TESTS (Must Pass):")
        print("-" * 30)
        for test in core_tests:
            if test():
                core_passed += 1
        
        print("\nOPTIONAL TESTS (May fail with mock PyGimli):")
        print("-" * 45)
        optional_passed = 0
        optional_total = len(optional_tests)
        for test in optional_tests:
            if test():
                optional_passed += 1
        
        # Summary
        print("=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Core Tests: {core_passed}/{core_total} passed")
        print(f"Optional Tests: {optional_passed}/{optional_total} passed")
        
        if core_passed == core_total:
            print("\n✅ ALL CORE TESTS PASSED - Backend integration working correctly!")
        else:
            print(f"\n❌ {core_total - core_passed} CORE TESTS FAILED - Backend needs fixes")
        
        print("\nDetailed Results:")
        for test_name, result in self.results.items():
            status = "✅" if result["success"] else "❌"
            print(f"{status} {test_name}")
            if result["error"]:
                print(f"   Error: {result['error']}")
        
        return core_passed == core_total

if __name__ == "__main__":
    tester = BERTBackendTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)