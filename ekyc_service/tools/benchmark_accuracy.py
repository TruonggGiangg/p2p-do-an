import torch
import onnxruntime as ort
import numpy as np
import cv2 as cv
import time
from pathlib import Path


# Simple parity check for Face Recognition
def benchmark_face_matcher(pytorch_model, onnx_model_path, test_images):
    print("\n--- Benchmarking Face Matcher ---")
    ort_session = ort.InferenceSession(onnx_model_path)
    
    diffs = []
    latencies_pt = []
    latencies_ort = []

    for img_path in test_images:
        img = cv.imread(str(img_path))
        img = cv.resize(img, (160, 160))
        img_rgb = cv.cvtColor(img, cv.COLOR_BGR2RGB)
        tensor = torch.from_numpy(img_rgb.transpose(2,0,1)).float().unsqueeze(0) / 255.0
        
        # PyTorch Inference
        start = time.time()
        with torch.no_grad():
            pt_out = pytorch_model(tensor).numpy()
        latencies_pt.append(time.time() - start)
        
        # ONNX Inference
        start = time.time()
        onnx_out = ort_session.run(None, {'input': tensor.numpy()})[0]
        latencies_ort.append(time.time() - start)
        
        # Correlation / L2 Distance
        dist = np.linalg.norm(pt_out - onnx_out)
        diffs.append(dist)

    print(f"Mean L2 Difference: {np.mean(diffs):.6f}")
    print(f"Max L2 Difference: {np.max(diffs):.6f}")
    print(f"Avg Latency PT: {np.mean(latencies_pt)*1000:.2f}ms")
    print(f"Avg Latency ORT: {np.mean(latencies_ort)*1000:.2f}ms")

if __name__ == "__main__":
    import sys
    project_root = "c:/Users/pnttm/Desktop/P2P_Lending/kyc/ekyc_service"
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    from facenet_pytorch import InceptionResnetV1
    
    BASE_DIR = Path("c:/Users/pnttm/Desktop/P2P_Lending/kyc/ekyc_service")
    WEIGHTS_DIR = BASE_DIR / "ekyc/models/weights"
    ONNX_PATH = WEIGHTS_DIR / "vggface2_int8.onnx"
    TEST_DIR = Path("c:/Users/pnttm/Desktop/P2P_Lending/data/calibration/face")
    
    if not ONNX_PATH.exists():
        print(f"Error: ONNX model not found at {ONNX_PATH}")
        sys.exit(1)
        
    # Load original PyTorch model
    print("Loading original PyTorch model (vggface2)...")
    pytorch_model = InceptionResnetV1(pretrained='vggface2').eval()
    
    # Get last 10 images from calibration set for testing
    test_images = list(TEST_DIR.glob("*.jpg"))[:10]
    
    if not test_images:
        print(f"Error: No images found in {TEST_DIR}")
        sys.exit(1)
        
    benchmark_face_matcher(pytorch_model, str(ONNX_PATH), test_images)
