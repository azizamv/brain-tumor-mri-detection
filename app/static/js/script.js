// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const resultsCard = document.getElementById('resultsCard');
const loadingOverlay = document.getElementById('loadingOverlay');
const themeToggle = document.getElementById('themeToggle');
const statsGrid = document.getElementById('statsGrid');
let probabilityChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🧠 NeuroScan AI Initialized');
    loadStatistics();
    initializeTheme();
    initializeDragDrop();
});

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    themeToggle.addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// Drag and Drop
function initializeDragDrop() {
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
}

// File Handling
function handleFileSelect(event) {
    if (event.target.files.length) {
        handleFile(event.target.files[0]);
    }
}

function handleFile(file) {
    // Validasi
    if (!file.type.match('image.*')) {
        showNotification('Please upload an image file', 'error');
        return;
    }
    
    if (file.size > 16 * 1024 * 1024) {
        showNotification('File size exceeds 16MB limit', 'error');
        return;
    }
    
    // Preview
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('imagePreview').src = e.target.result;
        document.getElementById('imageInfo').textContent = file.name;
        document.getElementById('imageSize').textContent = formatFileSize(file.size);
    };
    reader.readAsDataURL(file);
    
    // Upload
    uploadAndAnalyze(file);
}

// Upload and Analyze
async function uploadAndAnalyze(file) {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayResults(data);
            updateStatistics(data.stats);
        } else {
            throw new Error(data.error || 'Analysis failed');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Display Results
function displayResults(data) {
    const result = data;
    const classInfo = result.class_info;
    
    // Update result header
    document.getElementById('resultTitle').textContent = classInfo.name;
    document.getElementById('resultSubtitle').textContent = classInfo.description;
    document.getElementById('resultBadge').innerHTML = `<i class="${classInfo.icon}"></i>`;
    document.getElementById('resultBadge').style.backgroundColor = classInfo.color;
    
    // Update confidence
    const confidencePercent = (result.confidence * 100).toFixed(1);
    
    document.getElementById('confidenceValue').textContent = `${confidencePercent}%`;
    document.getElementById('confidenceFill').style.width = `${confidencePercent}%`;
    document.getElementById('confidenceFill').style.backgroundColor = classInfo.color;
    
    // Update probability bars
    updateProbabilityBars(result.all_probabilities);
    
    // Update detailed info
    updateDetailedInfo(result);
    
    // Show chart
    updateProbabilityChart(result.all_probabilities);
    
    // Show results with animation
    resultsCard.style.display = 'block';
    resultsCard.classList.remove('animate__fadeInRight');
    void resultsCard.offsetWidth; 
    resultsCard.classList.add('animate__animated', 'animate__fadeInRight');
    
    // Show chart container
    // document.getElementById('chartContainer').style.display = 'block';
    
    // Scroll to results
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update Probability Bars
function updateProbabilityBars(probabilities) {
    const container = document.getElementById('probabilityBars');
    container.innerHTML = '';
    
    // Sort by probability
    const sorted = Object.entries(probabilities).sort((a, b) => b[1].percentage - a[1].percentage);
    
    sorted.forEach(([className, data]) => {
        const bar = document.createElement('div');
        bar.className = 'probability-bar-item';
        bar.style.marginBottom = '15px';
        
        bar.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 20px; height: 20px; border-radius: 4px; background: ${data.info.color};"></div>
                    <span style="font-weight: 600; color: var(--dark);">${data.info.name}</span>
                </div>
                <span style="font-weight: 700; color: ${data.info.color};">${data.percentage.toFixed(1)}%</span>
            </div>
            <div style="height: 8px; background: var(--light); border-radius: 4px; overflow: hidden;">
                <div class="probability-bar-fill" 
                     style="height: 100%; width: 0%; background: ${data.info.color}; 
                            transition: width 1.5s ease-out; border-radius: 4px;">
                </div>
            </div>
        `;
        
        container.appendChild(bar);
        
        // Animate bar fill after a delay
        setTimeout(() => {
            bar.querySelector('.probability-bar-fill').style.width = `${data.percentage}%`;
        }, 300);
    });
}

// Update Detailed Info
function updateDetailedInfo(result) {
    const container = document.getElementById('detailedInfo');
    const classInfo = result.class_info;
    
    container.innerHTML = `
        <div class="detailed-info-card" style="background: ${classInfo.color}10; padding: 1.5rem; border-radius: var(--radius); border-left: 4px solid ${classInfo.color};">
            <h5 style="margin-bottom: 1rem; color: var(--dark);">
                <i class="fas fa-info-circle me-2" style="color: ${classInfo.color};"></i>Detailed Information
            </h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <p style="font-size: 0.9rem; color: var(--gray); margin-bottom: 5px;">Severity Level</p>
                    <p style="font-weight: 600; color: var(--dark);">${classInfo.severity}</p>
                </div>
                <div>
                    <p style="font-size: 0.9rem; color: var(--gray); margin-bottom: 5px;">Confidence Score</p>
                    <p style="font-weight: 600; color: var(--dark);">${(result.confidence * 100).toFixed(1)}%</p>
                </div>
            </div>
            <p style="margin-top: 1rem; color: var(--dark); font-size: 0.95rem;">
                ${classInfo.description}
            </p>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--light);">
                <small style="color: var(--gray);">
                    <i class="fas fa-clock me-1"></i> Analysis completed: ${new Date().toLocaleTimeString()}
                </small>
            </div>
        </div>
    `;
}

// Chart.js Integration
function updateProbabilityChart(probabilities) {
    const ctx = document.getElementById('probabilityChart').getContext('2d');
    
    if (probabilityChart) {
        probabilityChart.destroy();
    }
    
    const labels = Object.keys(probabilities).map(key => probabilities[key].info.name);
    const data = Object.values(probabilities).map(p => p.percentage);
    const colors = Object.values(probabilities).map(p => p.info.color);
    const borders = Object.values(probabilities).map(p => p.info.color + 'CC');
    
    probabilityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: borders,
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'var(--dark)',
                        font: {
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed.toFixed(1)}%`;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

// Statistics Management
async function loadStatistics() {
    try {
        const response = await fetch('/api/statistics');
        const stats = await response.json();
        updateStatistics(stats);
    } catch (error) {
        console.log('Could not load statistics');
    }
}

function updateStatistics(stats) {
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-chart-line"></i>
            </div>
            <div class="stat-value">${stats.total_predictions}</div>
            <div class="stat-label">Total Analyses</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-calendar-day"></i>
            </div>
            <div class="stat-value">${stats.predictions_today}</div>
            <div class="stat-label">Today</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-brain"></i>
            </div>
            <div class="stat-value">4</div>
            <div class="stat-label">Classes</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-bolt"></i>
            </div>
            <div class="stat-value">99.24%</div>
            <div class="stat-label">Accuracy</div>
        </div>
    `;
}

// Utility Functions
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--primary)'};
        color: white;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.3s ease-out;
    `;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 5000);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getColorForConfidence(level) {
    switch(level) {
        case 'success': return '#10b981';
        case 'info': return '#3b82f6';
        case 'warning': return '#f59e0b';
        case 'danger': return '#ef4444';
        default: return '#6366f1';
    }
}

// Action Functions
function analyzeAgain() {
    fileInput.value = '';
    resultsCard.style.display = 'none';
    // document.getElementById('chartContainer').style.display = 'none';
    showNotification('Ready for new analysis', 'info');
}

function downloadReport() {
    showNotification('Report download feature coming soon!', 'info');
}

function shareResults() {
    if (navigator.share) {
        navigator.share({
            title: 'NeuroScan AI Results',
            text: 'Check out my brain MRI analysis results!',
            url: window.location.href
        });
    } else {
        showNotification('Web Share API not supported in your browser', 'warning');
    }
}