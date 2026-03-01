# EKYC PROJECT

## Getting started

Fine-tuned for Vietnamese ID Card (Old and New Version within Chip)


1. Face Recognition
2. Liveness Detection (Facial Orientation)
3. OCR ID Card (Work fine with both new and old version)


"/api/ekyc-process": 
- Input: A list of 7 portrait images, and a front side ID card.
- Verify facial matching from portrait images & user face from ID card.

"/api/ekyc/frontID":
- Input: Front side ID Card.
- Process OCR.

"/api/ekyc/backID":
- Input: Back side ID Card
- Process OCR

"/api/ekyc/detection"
- Detect facial orientation by expectation
- Instruct user to capture image with orientation detection.

@HDAMC
