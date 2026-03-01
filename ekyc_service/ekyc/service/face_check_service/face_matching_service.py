import numpy as np
import torch
import torch.nn.functional as F
from facenet_pytorch import MTCNN

from ekyc.common.distance import cosine_distance, euclidean_distance, l1_distance, find_threshold
from ekyc.common.functions import extract_face, face_transform, align_face, normalize_contrast
from ekyc.models import VGGFace2


class FaceVerifier:
    def __init__(self, model_name="VGG-Face2", distance_metric="euclidean", device=None, detector=None, lock=None, onnx_path=None):
        self.model_name = model_name
        self.distance_metric = distance_metric
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.detector = detector if detector is not None else MTCNN(device=self.device)
        self.lock = lock
        
        self.onnx_session = None
        if onnx_path:
            import onnxruntime as ort
            print(f"Loading FaceVerifier ONNX model from {onnx_path}")
            
            # Optimization for Multiprocess/Threaded environment
            sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = 1
            sess_options.inter_op_num_threads = 1
            sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            self.onnx_session = ort.InferenceSession(onnx_path, sess_options)
            self.use_onnx = True
        else:
            self.verifier = VGGFace2.load_model(device=self.device)
            self.use_onnx = False
            # Apply FP16 if on CUDA
            if self.device.type == 'cuda':
                self.verifier.half()

        self.distance_func = {
            "cosine": cosine_distance,
            "L1": l1_distance,
            "euclidean": euclidean_distance,
        }.get(distance_metric, euclidean_distance)

        self.threshold = find_threshold(model_name=self.model_name, distance_metric=self.distance_metric)

    def verify(self, img1: np.ndarray, img2: np.ndarray, face1_extracted=False, face2_extracted=False):
        """
        Verify if two faces match.
        If face1_extracted or face2_extracted is True, the corresponding img is treated as a pre-cropped face.
        """
        def get_face(img, is_extracted):
            if is_extracted:
                return img, None, None  # Return 3 values to match unpack
            if self.lock:
                with self.lock:
                    return extract_face(img, self.detector, padding=1)
            return extract_face(img, self.detector, padding=1)

        face1, _, lm1 = get_face(img1, face1_extracted)
        face2, _, lm2 = get_face(img2, face2_extracted)

        if face1 is not None and face2 is not None:
            face1 = normalize_contrast(face1)
            face2 = normalize_contrast(face2)

            if lm1 is not None:
                face1 = align_face(face1, lm1)
            if lm2 is not None:
                face2 = align_face(face2, lm2)

            # Verifier (VGGFace2) call should also be thread-safe if it's a shared model
            if self.lock:
                with self.lock:
                    return self._face_matching(face1, face2)
            return self._face_matching(face1, face2)

        print("Không phát hiện đủ khuôn mặt từ ảnh.")
        return False

    def _face_matching(self, face1, face2):
        face1 = face_transform(face1, model_name=self.model_name, device=self.device)
        face2 = face_transform(face2, model_name=self.model_name, device=self.device)

        if self.use_onnx:
            input_name = self.onnx_session.get_inputs()[0].name
            # Run ONNX inference
            # face1 and face2 are torch tensors (1, 3, 160, 160)
            res1 = self.onnx_session.run(None, {input_name: face1.cpu().numpy()})[0]
            res2 = self.onnx_session.run(None, {input_name: face2.cpu().numpy()})[0]
            
            # Convert to torch for distance calculation (to reuse distance_func)
            result1 = torch.from_numpy(res1)
            result2 = torch.from_numpy(res2)
            
            # Standardize normalization just in case
            result1 = F.normalize(result1, p=2, dim=1)
            result2 = F.normalize(result2, p=2, dim=1)
        else:
            result1 = F.normalize(self.verifier(face1), p=2, dim=1)
            result2 = F.normalize(self.verifier(face2), p=2, dim=1)

        dis = self.distance_func(result1, result2)

        return dis < self.threshold
