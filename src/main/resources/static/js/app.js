/**
 * EJB to REST API Generator - Application JavaScript
 * Handles: drag-and-drop upload, file preview, diff viewer, progress bar, log console
 */

// ============================================================
// Upload / Drag & Drop
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    initUploadZone();
    initProgressBar();
    initAlertDismiss();
});

function initUploadZone() {
    var zone = document.querySelector('.upload-zone');
    if (!zone) return;

    var fileInput = zone.querySelector('input[type="file"]');

    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0 && fileInput) {
            fileInput.files = e.dataTransfer.files;
            updateFileName(fileInput);
        }
    });

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            updateFileName(this);
        });
    }
}

function updateFileName(input) {
    var zone = input.closest('.upload-zone');
    if (!zone) return;

    var nameDisplay = zone.querySelector('.file-name-display');
    if (input.files.length > 0) {
        var fileName = input.files[0].name;
        var fileSize = (input.files[0].size / 1024 / 1024).toFixed(2);
        if (nameDisplay) {
            nameDisplay.textContent = fileName + ' (' + fileSize + ' MB)';
            nameDisplay.style.display = 'block';
        }
        zone.style.borderColor = '#16a34a';
        zone.style.background = '#f0fdf4';
    }
}

function initAlertDismiss() {
    var alerts = document.querySelectorAll('.alert');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            alert.style.transition = 'opacity 0.5s';
            alert.style.opacity = '0';
            setTimeout(function() { alert.remove(); }, 500);
        }, 8000);
    });
}

// ============================================================
// File Preview (Results page)
// ============================================================

function loadFilePreview(filePath) {
    var card = document.getElementById('codePreviewCard');
    var preview = document.getElementById('codePreview');
    var fileName = document.getElementById('previewFileName');

    if (!card || !preview) return;

    card.style.display = 'block';
    if (fileName) fileName.textContent = filePath;
    preview.innerHTML = '<code>Chargement...</code>';

    fetch('/api/file-content?path=' + encodeURIComponent(filePath.trim()))
        .then(function(response) {
            if (!response.ok) throw new Error('Erreur ' + response.status);
            return response.text();
        })
        .then(function(content) {
            preview.innerHTML = '<code>' + escapeHtml(content) + '</code>';
        })
        .catch(function(error) {
            preview.innerHTML = '<code>// Erreur lors du chargement : ' + error.message + '</code>';
        });

    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// Diff Viewer (Results page)
// ============================================================

function loadDiff(useCaseClassName) {
    var container = document.getElementById('diffContainer');
    var original = document.getElementById('diffOriginal');
    var generated = document.getElementById('diffGenerated');

    if (!container || !useCaseClassName) {
        if (container) container.style.display = 'none';
        return;
    }

    container.style.display = 'grid';
    if (original) original.innerHTML = '<code>Chargement...</code>';
    if (generated) generated.innerHTML = '<code>Chargement...</code>';

    fetch('/api/diff?useCase=' + encodeURIComponent(useCaseClassName))
        .then(function(response) {
            if (!response.ok) throw new Error('Erreur ' + response.status);
            return response.json();
        })
        .then(function(data) {
            if (original) {
                var header = container.querySelector('.diff-panel-left .diff-panel-header span');
                if (header) header.textContent = 'Code EJB Original - ' + (data.originalName || '');
                original.innerHTML = '<code>' + escapeHtml(data.original || '// Non trouve') + '</code>';
            }
            if (generated) {
                var header2 = container.querySelector('.diff-panel-right .diff-panel-header span');
                if (header2) header2.textContent = 'Code REST Genere - ' + (data.generatedName || '');
                generated.innerHTML = '<code>' + escapeHtml(data.generated || '// Non trouve') + '</code>';
            }
        })
        .catch(function(error) {
            if (original) original.innerHTML = '<code>// Erreur : ' + error.message + '</code>';
            if (generated) generated.innerHTML = '<code>// Erreur : ' + error.message + '</code>';
        });
}

// ============================================================
// Progress Bar (Generation page)
// ============================================================

function initProgressBar() {
    // Auto-init if progress elements exist
}

function startGeneration() {
    var progressContainer = document.getElementById('progressContainer');
    var progressBar = document.getElementById('progressBar');
    var progressText = document.getElementById('progressText');
    var generateBtn = document.getElementById('generateBtn');

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressText) {
        progressText.style.display = 'block';
        progressText.textContent = 'Initialisation de la transformation...';
    }
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transformation en cours...';
    }

    var steps = [
        { pct: 15, msg: 'Parsing du code EJB avec JavaParser...' },
        { pct: 35, msg: 'Generation des Controllers REST...' },
        { pct: 55, msg: 'Generation des Service Adapters et DTOs...' },
        { pct: 70, msg: 'Application des regles SmartCodeEnhancer...' },
        { pct: 85, msg: 'Generation des tests unitaires...' },
        { pct: 95, msg: 'Packaging du projet...' },
        { pct: 100, msg: 'Transformation terminee !' }
    ];

    var stepIndex = 0;
    var interval = setInterval(function() {
        if (stepIndex < steps.length) {
            if (progressBar) progressBar.style.width = steps[stepIndex].pct + '%';
            if (progressText) progressText.textContent = steps[stepIndex].msg;
            addLogEntry('INFO', steps[stepIndex].msg);
            stepIndex++;
        } else {
            clearInterval(interval);
        }
    }, 800);
}

// ============================================================
// Log Console
// ============================================================

function addLogEntry(level, message) {
    var logConsole = document.getElementById('logConsole') || document.getElementById('systemLogConsole');
    if (!logConsole) return;

    var now = new Date();
    var time = now.getHours().toString().padStart(2, '0') + ':' +
               now.getMinutes().toString().padStart(2, '0') + ':' +
               now.getSeconds().toString().padStart(2, '0');

    var levelClass = 'log-info';
    if (level === 'SUCCESS') levelClass = 'log-success';
    else if (level === 'WARN' || level === 'WARNING') levelClass = 'log-warning';
    else if (level === 'ERROR') levelClass = 'log-error';

    var entry = document.createElement('div');
    entry.className = 'log-entry ' + levelClass;
    entry.innerHTML = '<span class="log-time">' + time + '</span>' +
                      '<span class="log-level">' + level + '</span>' +
                      '<span class="log-msg">' + escapeHtml(message) + '</span>';

    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function clearLogs() {
    var logConsole = document.getElementById('logConsole');
    if (logConsole) logConsole.innerHTML = '';
}

function clearLogDisplay() {
    var logConsole = document.getElementById('systemLogConsole');
    if (logConsole) logConsole.innerHTML = '';
}

function refreshLogs() {
    window.location.reload();
}

// ============================================================
// Report Filter
// ============================================================

function filterRules(category) {
    var table = document.getElementById('rulesTable');
    if (!table) return;

    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function(row) {
        if (category === 'all' || row.getAttribute('data-category') === category) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// ============================================================
// Utilities
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
