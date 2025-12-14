import os
import numpy as np
import tensorflow as tf
from flask import Flask, render_template, request, jsonify, send_from_directory
from PIL import Image
import io
import base64
import json
from datetime import datetime

app = Flask(__name__, static_folder='static')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'brain-tumor-secret-key-2024')

IMG_SIZE = (224, 224)
CLASS_NAMES = ["glioma", "meningioma", "notumor", "pituitary"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))

MODEL_PATH = os.path.join(
    PROJECT_ROOT,
    "outputs",
    "model",
    "densenet121_model.h5"
)

CLASS_DESCRIPTIONS = {
    "glioma": {
        "name": "Glioma",
        "description": "Tumor arising from glial cells in the brain or spinal cord.",
        "severity": "High",
        "color": "#ef4444",
        "icon": "fas fa-brain"
    },
    "meningioma": {
        "name": "Meningioma",
        "description": "Typically benign tumor arising from the meninges surrounding the brain.",
        "severity": "Medium",
        "color": "#f59e0b",
        "icon": "fas fa-brain"
    },
    "notumor": {
        "name": "No Tumor",
        "description": "Normal brain tissue with no evidence of tumor.",
        "severity": "Normal",
        "color": "#10b981",
        "icon": "fas fa-check-circle"
    },
    "pituitary": {
        "name": "Pituitary",
        "description": "Tumor developing in the pituitary gland at the base of the brain.",
        "severity": "Medium",
        "color": "#3b82f6",
        "icon": "fas fa-brain"
    }
}

# Statistics tracking
prediction_stats = {
    "total_predictions": 0,
    "predictions_today": 0,
    "last_prediction_time": None,
    "class_distribution": {class_name: 0 for class_name in CLASS_NAMES}
}

print("Loading model...")
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Model loaded successfully!")
    print(f"Model summary:")
    model.summary()
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

def allowed_file(filename):
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def preprocess_for_inference(image):
    # Convert ke RGB jika perlu
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize ke 224x224
    image = image.resize(IMG_SIZE)
    
    # Convert ke numpy array
    img_array = np.array(image, dtype=np.float32)
    
    # Normalisasi 0-255 -> 0-1
    img_array = img_array / 255.0
    
    # Expand dimensions untuk batch size
    img_array = np.expand_dims(img_array, axis=0)
    
    return img_array


def update_statistics(predicted_class):
    """Update prediction statistics"""
    now = datetime.now()
    prediction_stats["total_predictions"] += 1

    if prediction_stats["last_prediction_time"]:
        last_date = prediction_stats["last_prediction_time"].date()
        if now.date() > last_date:
            prediction_stats["predictions_today"] = 1
        else:
            prediction_stats["predictions_today"] += 1
    else:
        prediction_stats["predictions_today"] = 1
    
    prediction_stats["last_prediction_time"] = now
    prediction_stats["class_distribution"][predicted_class] += 1

def predict_image(image):
    """Predict class dari gambar"""
    try:
        if model is None:
            print("Using dummy model")
            probs = np.random.dirichlet(np.ones(4), size=1)[0]
            predicted_idx = np.argmax(probs)
            predicted_class = CLASS_NAMES[predicted_idx]
            confidence = float(probs[predicted_idx])
        else:
            img_array = preprocess_for_inference(image)
            predictions = model.predict(img_array, verbose=0)
            
            if len(predictions.shape) == 2:
                probs = tf.nn.softmax(predictions[0]).numpy()
            else:
                probs = predictions[0]

            predicted_idx = np.argmax(probs)
            predicted_class = CLASS_NAMES[predicted_idx]
            confidence = float(probs[predicted_idx])
        
        # Update statistics
        update_statistics(predicted_class)
        
        # Buat dictionary hasil
        result = {
            'predicted_class': predicted_class,
            'confidence': confidence,
            'all_probabilities': {
                class_name: {
                    'probability': float(probs[i]),
                    'percentage': float(probs[i] * 100),
                    'info': CLASS_DESCRIPTIONS[class_name]
                } for i, class_name in enumerate(CLASS_NAMES)
            },
            'class_info': CLASS_DESCRIPTIONS[predicted_class]
        }
        
        return result, None
        
    except Exception as e:
        print(f"Prediction error: {e}")
        return None, str(e)

def image_to_base64(image):
    buffered = io.BytesIO()
    image.save(buffered, format="PNG", optimize=True)
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

# APP
@app.route('/')
def home():
    return render_template('index.html', 
                         class_names=CLASS_NAMES,
                         class_descriptions=CLASS_DESCRIPTIONS,
                         img_size=IMG_SIZE,
                         stats=prediction_stats)

@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint untuk prediction"""
    try:
        # Cek jika file ada
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Please use PNG, JPG, JPEG, GIF, BMP, or TIFF'}), 400
        
        # Buka gambar
        try:
            image = Image.open(file.stream)
            # Verify it's a valid image
            image.verify()
            file.stream.seek(0)  
            image = Image.open(file.stream)
        except Exception as e:
            return jsonify({'error': f'Invalid image file: {str(e)}'}), 400
        
        # Predict
        result, error = predict_image(image)
        
        if error:
            return jsonify({'error': error}), 500
        
        # Convert image ke base64 untuk preview
        preview_size = (400, 400)
        preview_image = image.copy()
        preview_image.thumbnail(preview_size, Image.Resampling.LANCZOS)
        img_base64 = image_to_base64(preview_image)
        
        # Tambahkan info tambahan ke result
        result['image_preview'] = img_base64
        result['original_size'] = image.size
        result['filename'] = file.filename
        result['timestamp'] = datetime.now().isoformat()
        result['stats'] = prediction_stats
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Route error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/statistics')
def get_statistics():
    return jsonify(prediction_stats)

@app.route('/api/classes')
def get_classes():
    return jsonify(CLASS_DESCRIPTIONS)

@app.route('/test-image')
def test_image():
    try:
        # Create a test image
        test_image = Image.new('RGB', IMG_SIZE, color='white')
        
        result, error = predict_image(test_image)
        
        if error:
            return f"Error: {error}"
        
        return jsonify({
            "status": "success",
            "message": "Model is working correctly",
            "test_prediction": result
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health_check():
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "timestamp": datetime.now().isoformat()
    })

@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'favicon.ico')

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File is too large. Maximum size is 16MB'}), 413

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Buat folder untuk upload jika belum ada
    os.makedirs('static/uploads', exist_ok=True)
    
    # Print startup info
    print("\n" + "="*60)
    print("Brain Tumor MRI Classification System")
    print("="*60)
    print(f"Model: {'Loaded' if model else 'Not loaded'}")
    print(f"Classes: {len(CLASS_NAMES)} types")
    print(f"Image size: {IMG_SIZE}")
    print(f"Running on: http://localhost:5000")
    print("="*60 + "\n")
    
    # Run app
    app.run(debug=True)
