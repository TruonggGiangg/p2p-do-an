import yolov5
from blueprint import WEIGHTS_DIR

import ekyc.utils.utils as utils
import cv2 as cv
import re
import torch
import numpy as np
import ultralytics

from PIL import Image
from facenet_pytorch import MTCNN
from ekyc.service.face_check_service.face_matching_service import FaceVerifier
from vietocr.tool.config import Cfg
from vietocr.tool.predictor import Predictor
from ekyc.common.functions import get_image, enhance_image_for_ocr
from ekyc.service.face_check_service.face_orientation import FaceOrientationDetector


import gc
import threading
import os


class EKYCResource:
    """
    Singleton-like resource manager to load models once and share across requests.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super(EKYCResource, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
            
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Initializing EKYC resources on {self.device}...")
        
        # Thread locks for shared models
        self.lock = threading.Lock()

        # Face Detector: Use YuNet if onnx file exists, otherwise fallback to MTCNN
        yunet_path = str(WEIGHTS_DIR / "face_detection_yunet_2023mar.onnx")
        if os.path.exists(yunet_path):
            print("Using YuNet face detector")
            self.detector = cv.FaceDetectorYN.create(yunet_path, "", (320, 320))
            self.use_yunet = True
        else:
            print("YuNet weights not found, using MTCNN fallback")
            self.detector = MTCNN(device=self.device)
            self.use_yunet = False

        # Face Verifier: Use ONNX INT8 if exists (much lower RAM)
        vgg_onnx_path = str(WEIGHTS_DIR / "vggface2_int8.onnx")
        if not os.path.exists(vgg_onnx_path):
            vgg_onnx_path = None

        self.verifier = FaceVerifier(
            device=self.device, 
            detector=self.detector if not self.use_yunet else None, 
            lock=self.lock,
            onnx_path=vgg_onnx_path
        )
        self.orientation_detector = FaceOrientationDetector()

        self.CONF_CONTENT_THRESHOLD = 0.75
        
        # YOLO models: Prefer ONNX for RAM efficiency & shared memory
        corner_onnx = WEIGHTS_DIR / "corner.onnx"
        self.CORNER_MODEL = ultralytics.YOLO(str(corner_onnx if corner_onnx.exists() else WEIGHTS_DIR / "corner.pt"))
        
        self.CORNER_BACK = yolov5.load(str(WEIGHTS_DIR / "corner_back.pt"))
        self.CONTENT_MODEL = yolov5.load(str(WEIGHTS_DIR / "content.pt"))
        
        content_back_onnx = WEIGHTS_DIR / "content_back.onnx"
        self.CONTENT_BACK = ultralytics.YOLO(str(content_back_onnx if content_back_onnx.exists() else WEIGHTS_DIR / "content_back.pt"))
        
        new_content_back_onnx = WEIGHTS_DIR / "new_content_back.onnx"
        self.NEW_CONTENT_BACK = ultralytics.YOLO(str(new_content_back_onnx if new_content_back_onnx.exists() else WEIGHTS_DIR / "new_content_back.pt"))
        
        if self.device.type == 'cuda':
            # Note: YOLO models in ONNX don't need .to(device).half() 
            # as ONNX runtime handles the device mapping.
            # Only apply to remaining PyTorch models
            self.CONTENT_MODEL.half()
            self.CORNER_BACK.half()
            
            # For ultralytics models still in .pt (if any)
            if not corner_onnx.exists(): self.CORNER_MODEL.to(self.device).half()
            if not content_back_onnx.exists(): self.CONTENT_BACK.to(self.device).half()
            if not new_content_back_onnx.exists(): self.NEW_CONTENT_BACK.to(self.device).half()

        self.CONTENT_MODEL.conf = self.CONF_CONTENT_THRESHOLD

        # Sử dụng vgg_transformer thay vì vgg_seq2seq để nhận dạng dấu tiếng Việt chính xác hơn
        self.config = Cfg.load_config_from_name("vgg_transformer")
        self.config["cnn"]["pretrained"] = False
        self.config["device"] = self.device
        self.config["predictor"]["beamsearch"] = True  # Beam search cho transformer
        self.ocr_detector = Predictor(self.config)

        # Anti-Spoofing Model (MiniFASNetV2) - Silent Liveness Detection
        # Thử load ONNX trước, nếu không có thì dùng PyTorch
        minifas_onnx = WEIGHTS_DIR / "MiniFASNetV2.onnx"
        minifas_pth = WEIGHTS_DIR / "2.7_80x80_MiniFASNetV2.pth"
        
        if minifas_onnx.exists():
            import onnxruntime as ort
            self.spoof_session = ort.InferenceSession(str(minifas_onnx))
            self.spoof_model = None
            self.has_antispoof = True
            self.antispoof_backend = "onnx"
            print("Anti-Spoofing model (ONNX) loaded successfully")
        elif minifas_pth.exists():
            # Load PyTorch model
            from ekyc.service.minifasnet import MiniFASNetV2
            self.spoof_model = MiniFASNetV2()
            state_dict = torch.load(str(minifas_pth), map_location=self.device)
            # Remove 'module.' prefix if present
            new_state_dict = {}
            for k, v in state_dict.items():
                name = k.replace("module.", "").replace(".model.", ".")
                new_state_dict[name] = v
            self.spoof_model.load_state_dict(new_state_dict)
            self.spoof_model.to(self.device)
            self.spoof_model.eval()
            self.spoof_session = None
            self.has_antispoof = True
            self.antispoof_backend = "pytorch"
            print("Anti-Spoofing model (PyTorch) loaded successfully")
        else:
            self.spoof_session = None
            self.spoof_model = None
            self.has_antispoof = False
            self.antispoof_backend = None
            print(f"WARNING: Anti-Spoofing model not found")

        # EKYC models are now loaded. 
        # CAUTION: Do NOT run full inference (warm-up) in the Master process
        # as it may cause Segfaults (code 139) after forking.
        print("Models loaded in Master process for memory sharing.")

        self._initialized = True


class EKYCService:
    def __init__(self):
        # Access shared resources
        self.res = EKYCResource()

    def _cleanup(self):
        """Force garbage collection and clear GPU cache."""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def _detect_faces(self, rgb_img):
        """Thread-safe face detection wrapper supporting both MTCNN and YuNet."""
        with self.res.lock:
            if self.res.use_yunet:
                # YuNet expects BGR for internal processing if not specified, 
                # but let's assume input is RGB and convert to BGR for YuNet
                bgr = cv.cvtColor(rgb_img, cv.COLOR_RGB2BGR)
                self.res.detector.setInputSize((bgr.shape[1], bgr.shape[0]))
                _, faces = self.res.detector.detect(bgr)
                
                if faces is not None:
                    # YuNet returns [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_ml, y_ml, x_mr, y_mr, score]
                    # MTCNN orientation_detector expects 5 facial landmarks: 
                    # [left_eye, right_eye, nose, left_mouth, right_mouth]
                    
                    # YuNet landmarks: 
                    # Right Eye: [4, 5], Left Eye: [6, 7], Nose: [8, 9], Right Mouth: [10, 11], Left Mouth: [12, 13]
                    # Note: YuNet uses right/left from viewer's perspective usually
                    
                    boxes = []
                    landmarks = []
                    for face in faces:
                        x, y, w, h = face[:4].astype(int)
                        boxes.append([x, y, x+w, y+h])
                        
                        # Mapping to MTCNN landmark format (eye_left, eye_right, nose, mouth_left, mouth_right)
                        # Re-evaluating YuNet landmark order: 
                        # face[4:14] are landmarks. Usually: re, le, nt, rm, lm
                        lms = np.array([
                            [face[6], face[7]], # Left eye
                            [face[4], face[5]], # Right eye
                            [face[8], face[9]], # Nose
                            [face[12], face[13]], # Left mouth
                            [face[10], face[11]]  # Right mouth
                        ])
                        landmarks.append(lms)
                    return np.array(boxes), None, np.array(landmarks)
                return None, None, None
            else:
                return self.res.detector.detect(rgb_img, landmarks=True)

    def _preprocess_image(self, image_path, max_dim=1080):
        """Read and resize image early to save memory."""
        img = cv.imread(image_path)
        if img is None:
            return None
        
        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            img = cv.resize(img, (int(w * scale), int(h * scale)))
        return img

    def process_detection(self, image_path, destination):
        try:
            print(f"Processing detection for: {destination}")
            img = self._preprocess_image(image_path)
            if img is None:
                return {"success": False, "error": "Could not read image", "orientation": None}
                
            rgb = cv.cvtColor(img, cv.COLOR_BGR2RGB)

            boxes, probs, landmarks = self._detect_faces(rgb)
            if boxes is None or len(boxes) == 0:
                return {"success": False, "error": "No face detected", "orientation": None}

            lm = landmarks[0]
            try:
                detected_orientation = self.res.orientation_detector.detect(lm)
                orientation_map = {'front': 'center', 'left': 'left', 'right': 'right'}
                mapped_orientation = orientation_map.get(detected_orientation, detected_orientation)
                
                if destination == 'up':
                    match = detected_orientation == 'front'
                else:
                    match = (mapped_orientation == destination)
            except Exception as e:
                print(f"Detection error: {e}")
                detected_orientation = mapped_orientation = None
                match = False

            return {
                "success": match,
                "orientation": mapped_orientation,
                "detected_raw": detected_orientation,
                "expected": destination,
                "message": f"Expected: {destination}, Got: {mapped_orientation}" if mapped_orientation else "Detection failed"
            }
        finally:
            self._cleanup()

    def process_ekyc(self, portrait_paths: list[str], cccd_path: str):
        try:
            best_face = None
            max_box_area = 0

            for img_path in portrait_paths:
                frame = self._preprocess_image(img_path, max_dim=720) # Portrait can be smaller
                if frame is None: continue

                small_frame = cv.resize(frame, (640, 360))
                rgb = cv.cvtColor(small_frame, cv.COLOR_BGR2RGB)

                boxes, probs, landmarks = self._detect_faces(rgb)
                if boxes is not None and len(boxes) > 0:
                    x1, y1, x2, y2 = boxes[0].astype(int)
                    box_area = (x2 - x1) * (y2 - y1)

                    if box_area > max_box_area:
                        scale_x, scale_y = frame.shape[1] / 640, frame.shape[0] / 360
                        full_x1, full_y1 = int(x1 * scale_x), int(y1 * scale_y)
                        full_x2, full_y2 = int(x2 * scale_x), int(y2 * scale_y)
                        best_face = frame[full_y1:full_y2, full_x1:full_x2]
                        max_box_area = box_area

            if best_face is None or best_face.size == 0:
                return {"success": False, "error": "Không phát hiện khuôn mặt trong ảnh gửi lên"}

            best_face_rgb = cv.cvtColor(best_face, cv.COLOR_BGR2RGB)
            cccd_image = self._preprocess_image(cccd_path)
            if cccd_image is not None:
                cccd_image = cv.cvtColor(cccd_image, cv.COLOR_BGR2RGB)
                
            match = self.res.verifier.verify(best_face_rgb, cccd_image, face1_extracted=True)

            return {"success": True, "face_matching": bool(match)}
        finally:
            self._cleanup()

    def check_antispoof(self, face_crop):
        """
        Silent Anti-Spoofing: Phát hiện ảnh giả mạo (print attack, screen replay)
        Input: face_crop - BGR image của khuôn mặt đã crop
        Output: (is_real: bool, confidence: float)
        """
        if not self.res.has_antispoof:
            print("Warning: Anti-spoofing model not available, skipping check")
            return True, 1.0  # Fallback: assume real
        
        try:
            # Preprocessing theo chuẩn MiniFASNet (80x80 RGB)
            resized = cv.resize(face_crop, (80, 80))
            
            if self.res.antispoof_backend == "onnx":
                # ONNX Inference - normalize input
                img = resized.astype(np.float32) / 255.0  # Normalize 0-1
                img = img.transpose((2, 0, 1))  # HWC -> CHW
                img = np.expand_dims(img, axis=0)
                
                input_name = self.res.spoof_session.get_inputs()[0].name
                result = self.res.spoof_session.run(None, {input_name: img})
                logits = result[0][0]
                
                # Apply softmax to convert logits to probabilities
                exp_logits = np.exp(logits - np.max(logits))
                probs = exp_logits / exp_logits.sum()
                
            elif self.res.antispoof_backend == "pytorch":
                # PyTorch Inference
                img = resized.astype(np.float32) / 255.0
                img = img.transpose((2, 0, 1))  # HWC -> CHW
                img_tensor = torch.from_numpy(img).unsqueeze(0).to(self.res.device)
                
                with torch.no_grad():
                    logits = self.res.spoof_model(img_tensor)
                    # Apply softmax to convert logits to probabilities
                    probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            else:
                return True, 1.0
            
            # MiniFASNetV2 output 3 classes: [fake_print, fake_replay, real]
            # Debug: in tất cả probabilities
            print(f"Anti-spoof probs (all): {[f'{p:.3f}' for p in probs]}")
            
            # Dựa trên log: index 2 là "real" (0.994), index 0,1 là fake types
            prob_class_0 = float(probs[0])  # fake_print
            prob_class_1 = float(probs[1])  # fake_replay  
            prob_class_2 = float(probs[2]) if len(probs) > 2 else 0.0  # real
            
            # Real = class 2, Fake = class 0 + class 1
            prob_real = prob_class_2
            prob_fake = prob_class_0 + prob_class_1
            
            # Threshold: prob_real phải là max và > 0.5
            is_real = prob_real > prob_fake and prob_real > 0.5
            
            print(f"Anti-spoof ({self.res.antispoof_backend}): is_real={is_real}, prob_real={prob_real:.3f}, prob_fake={prob_fake:.3f}")
            return is_real, prob_real
            
        except Exception as e:
            print(f"Anti-spoof check error: {e}")
            return True, 0.5  # Fallback on error

    def check_motion(self, landmarks_list):
        """
        Simple Motion Check: Phát hiện chuyển động vi mô (micro-movement)
        Input: landmarks_list - List các landmarks từ nhiều frame
        Output: (has_motion: bool, variance: float)
        """
        if len(landmarks_list) < 3:
            return True, 0.0  # Không đủ frame để check
        
        try:
            # Tính variance của các điểm landmarks giữa các frame
            all_landmarks = np.array(landmarks_list)  # Shape: (n_frames, 5, 2)
            
            # Tính độ lệch chuẩn cho mỗi điểm
            variances = np.std(all_landmarks, axis=0)  # Shape: (5, 2)
            avg_variance = np.mean(variances)
            
            # Ngưỡng: nếu variance quá nhỏ (< 0.5) => ảnh tĩnh
            # Nếu variance tự nhiên (0.5 - 10) => người thật (do tay rung)
            has_motion = avg_variance > 0.5
            
            print(f"Motion check: has_motion={has_motion}, avg_variance={avg_variance:.3f}")
            return has_motion, float(avg_variance)
            
        except Exception as e:
            print(f"Motion check error: {e}")
            return True, 0.0

    def process_hybrid_liveness(self, portrait_paths: list[str], cccd_path: str):
        """
        Hybrid Liveness Detection: Kết hợp 3 layer
        1. Anti-Spoofing (Silent)
        2. Motion Check
        3. Face Matching
        """
        try:
            print(f"=== Hybrid Liveness Detection ===")
            print(f"Processing {len(portrait_paths)} portrait images")
            
            face_crops = []
            landmarks_list = []
            best_face = None
            max_box_area = 0
            
            # Detect faces và thu thập landmarks từ tất cả frames
            for idx, img_path in enumerate(portrait_paths):
                frame = self._preprocess_image(img_path, max_dim=720)
                if frame is None:
                    continue
                
                rgb = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
                boxes, probs, landmarks = self._detect_faces(rgb)
                
                if boxes is None or len(boxes) == 0:
                    continue
                
                x1, y1, x2, y2 = boxes[0].astype(int)
                face_crop = frame[max(0,y1):y2, max(0,x1):x2]
                
                if face_crop.size > 0:
                    face_crops.append(face_crop)
                    
                    if landmarks is not None and len(landmarks) > 0:
                        landmarks_list.append(landmarks[0])
                    
                    box_area = (x2 - x1) * (y2 - y1)
                    if box_area > max_box_area:
                        best_face = face_crop
                        max_box_area = box_area
            
            if len(face_crops) == 0 or best_face is None:
                return {
                    "success": False, 
                    "error": "Không phát hiện khuôn mặt trong ảnh",
                    "liveness": False,
                    "face_matching": False
                }
            
            # Layer 1: Anti-Spoofing Check (trên frame tốt nhất)
            is_real, spoof_confidence = self.check_antispoof(best_face)
            if not is_real:
                return {
                    "success": False,
                    "error": "Phát hiện ảnh giả mạo. Vui lòng sử dụng khuôn mặt thật.",
                    "liveness": False,
                    "spoof_score": spoof_confidence,
                    "face_matching": False
                }
            
            # Layer 2: Motion Check (nếu có đủ landmarks)
            has_motion, motion_variance = self.check_motion(landmarks_list)
            if len(landmarks_list) >= 3 and not has_motion:
                print(f"Warning: Low motion detected (variance={motion_variance})")
                # Không fail ngay, nhưng ghi nhận warning
            
            # Layer 3: Face Matching với CCCD
            cccd_image = self._preprocess_image(cccd_path)
            if cccd_image is None:
                return {
                    "success": False,
                    "error": "Không thể đọc ảnh CCCD",
                    "liveness": True,
                    "face_matching": False
                }
            
            cccd_rgb = cv.cvtColor(cccd_image, cv.COLOR_BGR2RGB)
            best_face_rgb = cv.cvtColor(best_face, cv.COLOR_BGR2RGB)
            
            try:
                match = self.res.verifier.verify(best_face_rgb, cccd_rgb, face1_extracted=True)
            except Exception as e:
                print(f"Face matching error: {e}")
                return {
                    "success": False,
                    "error": f"Lỗi so khớp khuôn mặt: {str(e)}",
                    "liveness": True,
                    "face_matching": False
                }
            
            result = {
                "success": True,
                "liveness": True,
                "face_matching": bool(match),
                "spoof_score": float(spoof_confidence),
                "motion_variance": float(motion_variance) if len(landmarks_list) >= 3 else None,
                "frames_processed": len(face_crops)
            }
            
            print(f"Hybrid Liveness Result: {result}")
            return result
            
        finally:
            self._cleanup()

    def process_ocr_back(self, image_path):
        try:
            image = self._preprocess_image(image_path)
            if image is None:
                return {"success": False, "error": f"Không đọc được ảnh từ {image_path}"}

            new_results = self.res.NEW_CONTENT_BACK(image, verbose=False)[0]
            new_class_names = {
                0: 'Date of expirty', 1: 'Date of issue', 2: 'Place', 3: 'Place of birth',
                4: 'address_1', 5: 'address_2', 6: 'bottom_left', 7: 'bottom_right',
                8: 'cdate_of_birth', 9: 'cdate_of_expiry', 10: 'cdate_of_issue',
                11: 'cplace_of_birth', 12: 'date_of_expiry', 13: 'date_of_issue',
                14: 'place', 15: 'place_of_birth', 16: 'top_left', 17: 'top_right'
            }

            extracted_new = {}
            found_issue_date = False

            for box in new_results.boxes:
                if box.conf[0].item() < 0.6: continue

                cls_id = int(box.cls[0].item())
                label = new_class_names.get(cls_id, f"class_{cls_id}")
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                crop = image[y1:y2, x1:x2]
                
                crop_enhanced = enhance_image_for_ocr(crop)
                crop_pil = Image.fromarray(crop_enhanced)

                text = self.res.ocr_detector.predict(crop_pil).strip()
                if text and len(text) >= 3:
                    extracted_new[label] = text
                    if label in ['cdate_of_issue', 'Date of issue']:
                        found_issue_date = True

            if extracted_new and found_issue_date:
                keys = ['address_1', 'address_2', 'cdate_of_issue', 'cdate_of_expiry', 'cplace_of_birth']
                simplified = {k: extracted_new.get(k, "").split(":", 1)[-1].strip() if ":" in extracted_new.get(k, "") else extracted_new.get(k, "") for k in keys}

                return {
                    "success": True,
                    "version": "new",
                    "data": {
                        "address": simplified.get("address_1", "") + " " + simplified.get("address_2", ""),
                        "issue_date": simplified.get("cdate_of_issue", ""),
                        "expiry_date": simplified.get("cdate_of_expiry", ""),
                        "place_of_birth": simplified.get("cplace_of_birth", "")
                    }
                }

            # Fallback to old model
            old_results = self.res.CONTENT_BACK(image, verbose=False)[0]
            old_class_names = {0: 'Issue_date', 1: 'Issuer', 2: 'MRZ', 3: 'Personal_identification', 4: 'fingerprint'}

            for box in old_results.boxes:
                if box.conf[0].item() < 0.6: continue
                cls_id = int(box.cls[0].item())
                if old_class_names.get(cls_id) == "Issue_date":
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    crop = image[y1:y2, x1:x2]
                    crop_enhanced = enhance_image_for_ocr(crop)
                    text = self.res.ocr_detector.predict(Image.fromarray(crop_enhanced)).strip()
                    date_match = re.search(r'(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})', text)
                    return {"success": True, "version": "old", "data": {"init_date": date_match.group(1) if date_match else text}}

            return {"success": False, "error": "Không phát hiện được thông tin mặt sau."}
        finally:
            self._cleanup()

    def detect_corner(self, image_path: str):
        # We don't read image here because detect_corner assumes image_path
        # But for memory optimization, we should probably pass the decoded image
        # Let's keep it for now as it uses PIL inside
        img = Image.open(image_path).convert("RGB")
        # Corner back uses yolov5 instance from resource
        corner_preds = self.res.CORNER_BACK(image_path).pred[0]
        if corner_preds is None or corner_preds.size(0) < 4:
            raise ValueError("Không phát hiện đủ 4 góc.")

        corner_boxes = corner_preds[:, :4].tolist()
        corner_classes = corner_preds[:, 5].tolist()
        ordered_boxes = utils.class_Order(corner_boxes, corner_classes)
        center_points = list(map(utils.get_center_point, ordered_boxes))

        c2, c3 = center_points[2], center_points[3]
        center_points = [center_points[0], center_points[1], (c2[0], c2[1] + 30), (c3[0], c3[1] + 30)]

        aligned = utils.four_point_transform(img, np.asarray(center_points))
        return Image.fromarray(aligned)

    def process_ocr(self, image_path):
        try:
            aligned_img = self.detect_corner(image_path)
            content_preds = self.res.CONTENT_MODEL(aligned_img).pred[0]
            if content_preds is None or content_preds.size(0) == 0:
                return {"success": False, "error": "Không phát hiện nội dung."}

            content_boxes = content_preds[:, :4].tolist()
            content_classes = content_preds[:, 5].tolist()
            boxes, classes = utils.non_max_suppression_fast(np.array(content_boxes), content_classes, 0.7)
            boxes = utils.class_Order(boxes, classes)

            fields = []
            aligned_np = np.array(aligned_img)
            for i, box in enumerate(boxes):
                left, top, right, bottom = map(int, box)
                if 5 < i < 9: right += 100
                
                crop = aligned_np[top:bottom, left:right]
                if i > 0:
                    crop_enhanced = enhance_image_for_ocr(crop)
                    text = self.res.ocr_detector.predict(Image.fromarray(crop_enhanced))
                    fields.append(text)

            if 7 in content_classes and len(fields) >= 9:
                fields = fields[:6] + [fields[6] + ", " + fields[7]] + [fields[8]]

            field_names = ["idNumber", "fullName", "dob", "gender", "nationality", "birthplace", "address"] if len(fields) >= 7 else ["idNumber", "fullName", "gender", "nationality", "dob"]
            return {k: v for k, v in zip(field_names, fields)}
        finally:
            self._cleanup()

