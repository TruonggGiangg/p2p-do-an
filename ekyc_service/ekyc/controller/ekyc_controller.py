import os
import time

from blueprint import api_bp
from flask import request, jsonify

from container import Container
from ekyc.service.ekyc_service import EKYCService
import tempfile
from dependency_injector.wiring import Provide, inject

def safe_remove_file(file_path, max_attempts=3, delay=0.1):
    """
    Safely remove file với retry mechanism để tránh PermissionError
    """
    for attempt in range(max_attempts):
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            return True
        except PermissionError:
            if attempt < max_attempts - 1:
                time.sleep(delay)
                continue
            else:
                # Log warning nhưng không crash
                print(f"Warning: Could not delete {file_path} after {max_attempts} attempts")
                return False
        except Exception as e:
            print(f"Error removing file {file_path}: {e}")
            return False
    return False

@api_bp.route("/ekyc/frontID", methods=["POST"])
@inject
def front_verify(ekyc_service: EKYCService = Provide[Container.ekyc_service]):

    cccd_front = request.files.get("frontID")
    
    # Guard clause: Fail-fast validation
    if not cccd_front:
        return jsonify({"error": "Thiếu file frontID"}), 400

    tmp_cccd = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp_cccd_path = tmp_cccd.name
    cccd_front.save(tmp_cccd_path)
    tmp_cccd.close()  # Đóng handle

    try:
        result = ekyc_service.process_ocr(tmp_cccd_path)
        return jsonify({
            "result": result
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        safe_remove_file(tmp_cccd_path)


@api_bp.route("/ekyc/backID", methods=["POST"])
@inject
def back_verify(ekyc_service: EKYCService = Provide[Container.ekyc_service]):

    cccd_back = request.files.get("backID")
    
    # Guard clause: Fail-fast validation
    if not cccd_back:
        return jsonify({"error": "Thiếu file backID"}), 400

    tmp_cccd = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp_cccd_path = tmp_cccd.name
    cccd_back.save(tmp_cccd_path)
    tmp_cccd.close()  # Đóng handle

    try:
        result = ekyc_service.process_ocr_back(tmp_cccd_path)
        return jsonify({
            "result": result
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        safe_remove_file(tmp_cccd_path)


@api_bp.route("/ekyc/detection", methods=["POST"])
@inject
def orientation_step(ekyc_service: EKYCService = Provide[Container.ekyc_service]):
    expected = request.form.get("expected")
    image_file = request.files.get("frame")
    if not image_file or not expected:
        return jsonify({"error": "Thiếu ảnh hoặc tham số expected"}), 400

    # Lưu file tạm
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp_path = tmp.name
    image_file.save(tmp_path)
    tmp.close()  # Đóng file handle

    try:
        result = ekyc_service.process_detection(tmp_path, expected)
        return result
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        # Safe cleanup với retry
        safe_remove_file(tmp_path)

@api_bp.route("/ekyc-process", methods=["POST"])
@inject
def ekyc_verify(ekyc_service: EKYCService = Provide[Container.ekyc_service]):
    # Nhận danh sách ảnh khuôn mặt (linh hoạt 1-7 ảnh)
    portrait_images = request.files.getlist("portraitImages")
    cccd_front = request.files.get("frontID")

    # Kiểm tra có ít nhất 1 ảnh portrait
    if len(portrait_images) < 1:
        return jsonify({"error": "Cần ít nhất 1 ảnh khuôn mặt"}), 400
    
    if not cccd_front:
        return jsonify({"error": "Thiếu file frontID"}), 400
    
    if not cccd_front.mimetype.startswith("image/"):
        return jsonify({"error": "File frontID phải là ảnh"}), 400

    # Kiểm tra định dạng file là ảnh
    for image_file in portrait_images:
        if not image_file.mimetype.startswith("image/"):
            return jsonify({"error": "File ảnh không hợp lệ"}), 400

    portrait_paths = []
    tmp_cccd = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp_cccd_path = tmp_cccd.name
    tmp_cccd.close()  # Đóng handle ngay

    try:
        # Lưu 7 ảnh khuôn mặt
        for image_file in portrait_images:
            tmp_img = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmp_img_path = tmp_img.name
            image_file.save(tmp_img_path)
            tmp_img.close()  # Đóng handle ngay
            portrait_paths.append(tmp_img_path)

        # Lưu CCCD
        cccd_front.save(tmp_cccd_path)

        ekyc_check = ekyc_service.process_ekyc(portrait_paths, tmp_cccd_path)

        return jsonify({
            "results": ekyc_check,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        for path in portrait_paths:
            safe_remove_file(path)
        safe_remove_file(tmp_cccd_path)


@api_bp.route("/ekyc/liveness", methods=["POST"])
@inject
def hybrid_liveness(ekyc_service: EKYCService = Provide[Container.ekyc_service]):
    """
    Hybrid Liveness Detection Endpoint
    - Input: portraitImages (1-10 ảnh), frontID (ảnh CCCD mặt trước)
    - Output: liveness, face_matching, spoof_score, motion_variance
    """
    portrait_images = request.files.getlist("portraitImages")
    cccd_front = request.files.get("frontID")

    # Validate input
    if len(portrait_images) < 1:
        return jsonify({"error": "Cần ít nhất 1 ảnh khuôn mặt"}), 400
    
    if not cccd_front:
        return jsonify({"error": "Thiếu file frontID"}), 400
    
    portrait_paths = []
    tmp_cccd = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp_cccd_path = tmp_cccd.name
    tmp_cccd.close()

    try:
        # Save portrait images
        for image_file in portrait_images:
            if not image_file.mimetype.startswith("image/"):
                continue
            tmp_img = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmp_img_path = tmp_img.name
            image_file.save(tmp_img_path)
            tmp_img.close()
            portrait_paths.append(tmp_img_path)

        if len(portrait_paths) == 0:
            return jsonify({"error": "Không có ảnh hợp lệ"}), 400

        # Save CCCD
        cccd_front.save(tmp_cccd_path)

        # Process Hybrid Liveness
        result = ekyc_service.process_hybrid_liveness(portrait_paths, tmp_cccd_path)
        return jsonify({"results": result})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        for path in portrait_paths:
            safe_remove_file(path)
        safe_remove_file(tmp_cccd_path)
