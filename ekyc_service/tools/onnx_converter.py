import sys
import os
from pathlib import Path

# Add project root to sys.path before local imports
# Assuming tools/onnx_converter.py, project root is the parent directory
project_root = str(Path(__file__).parent.parent.absolute())
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import torch
import onnx
import onnxruntime
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType
import numpy as np
from PIL import Image
import cv2 as cv

# Local imports
from ekyc.models import VGGFace2
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg

class ImageCalibrationDataReader(CalibrationDataReader):
    def __init__(self, image_folder, input_name, width, height):
        self.image_folder = Path(image_folder)
        self.image_list = list(self.image_folder.glob("*.jpg")) + list(self.image_folder.glob("*.png"))
        self.input_name = input_name
        self.width = width
        self.height = height
        self.datasize = len(self.image_list)
        self.enum_data = None   

    def get_next(self):
        if self.enum_data is None:
            self.enum_data = iter([self._preprocess(img) for img in self.image_list])
        return next(self.enum_data, None)

    def _preprocess(self, img_path):
        img = cv.imread(str(img_path))
        img = cv.resize(img, (self.width, self.height))
        img = cv.cvtColor(img, cv.COLOR_BGR2RGB)
        img = img.transpose(2, 0, 1).astype(np.float32) / 255.0
        img = np.expand_dims(img, axis=0)
        return {self.input_name: img}

def convert_vggface2_to_onnx(weight_path, output_path):
    print(f"Converting VGGFace2...")
    try:
        # Try local implementation first
        if weight_path and os.path.exists(weight_path):
            print(f"Loading weights from {weight_path}")
            model = VGGFace2.load_model(device="cpu", pretrained=weight_path)
        else:
            # Fallback to facenet-pytorch (will download weights if needed)
            print("Local weights not found. Falling back to facenet_pytorch...")
            from facenet_pytorch import InceptionResnetV1
            model = InceptionResnetV1(pretrained='vggface2').eval()
    except Exception as e:
        print(f"Error loading model: {e}")
        print("Final attempt: loading from facenet_pytorch directly...")
        from facenet_pytorch import InceptionResnetV1
        model = InceptionResnetV1(pretrained='vggface2').eval()

    model.eval()
    dummy_input = torch.randn(1, 3, 160, 160)
    torch.onnx.export(
        model, 
        dummy_input, 
        output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    print(f"Exported to {output_path}")

def convert_vietocr_to_onnx(output_path):
    print(f"Converting VietOCR to ONNX...")
    # Setup config similar to EKYCService
    config = Cfg.load_config_from_name("vgg_seq2seq")
    config["cnn"]["pretrained"] = False
    config["device"] = "cpu"
    config["predictor"]["beamsearch"] = False
    
    predictor = Predictor(config)
    model = predictor.model
    model.eval()
    
    # VietOCR expects (1, 3, 32, variable_width)
    dummy_input = torch.randn(1, 3, 32, 256)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size', 3: 'width'},
            'output': {0: 'batch_size', 1: 'seq_len'}
        }
    )
    print(f"VietOCR exported to {output_path}")

def convert_yolo_to_onnx(model_path, output_path):
    print(f"Converting YOLO {model_path} to ONNX...")
    from ultralytics import YOLO
    model = YOLO(model_path)
    # ultralytics has a very convenient export method
    # int8=True requires a dataset, but we can do FP32 or half first
    # Many users prefer FP32/FP16 for YOLO to keep accuracy high
    model.export(format='onnx', opset=12) # Use opset 12 for high compatibility
    print(f"YOLO exported. Check for {Path(model_path).with_suffix('.onnx')}")

def quantize_model(model_path, output_path, calibration_folder, width, height):
    print(f"Quantizing {model_path} to INT8 with calibration...")
    dr = ImageCalibrationDataReader(calibration_folder, 'input', width, height)
    
    quantize_static(
        model_input=model_path,
        model_output=output_path,
        calibration_data_reader=dr,
        quant_format=QuantType.QInt8,
        per_channel=True,
        weight_type=QuantType.QInt8
    )
    print(f"Quantized model saved to {output_path}")

if __name__ == "__main__":
    BASE_DIR = Path(project_root)
    WEIGHTS_DIR = BASE_DIR / "ekyc/models/weights"
    CALIB_DIR = Path("c:/Users/pnttm/Desktop/P2P_Lending/data/calibration/face")

    vgg_onnx = WEIGHTS_DIR / "vggface2.onnx"
    vgg_quant = WEIGHTS_DIR / "vggface2_int8.onnx"
    
    # 1. Convert VGGFace2 to ONNX (FP32) - DONE
    # convert_vggface2_to_onnx(None, str(vgg_onnx))
    
    # 2. Quantize VGGFace2 to INT8 - DONE
    # if CALIB_DIR.exists():
    #     quantize_model(str(vgg_onnx), str(vgg_quant), str(CALIB_DIR), 160, 160)
    # else:
    #     print(f"Skipping VGGFace2 quantization: {CALIB_DIR} not found.")

    # 3. Convert all YOLO models to ONNX
    yolo_models = ["content_back.pt", "new_content_back.pt", "corner.pt", "corner_back.pt", "content.pt"]
    for m in yolo_models:
        yolo_path = WEIGHTS_DIR / m
        if yolo_path.exists():
            convert_yolo_to_onnx(str(yolo_path), None)

    print("\nNext: You can run benchmark_accuracy.py to verify.")
