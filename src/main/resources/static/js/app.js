/**
 * Direction Digitale Factory - BMCE Bank - Application JavaScript
 * Handles: drag-and-drop upload, file preview, diff viewer, progress bar, log console
 */

document.addEventListener('DOMContentLoaded', function() {
    initUploadZone();
    initAlertDismiss();
});

// ============================================================
// Upload / Drag & Drop
// ============================================================

function initUploadZone() {
    var zone = document.getElementById('uploadArea');
    var fileInput = document.getElementById('fileInput');

    if (!zone || !fileInput) return;

    // Click on zone opens file dialog
    zone.addEventListener('click', function(e) {
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });

    // Drag over
    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
    });

    // Drag enter
    zone.addEventListener('dragenter', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
    });

    // Drag leave
    zone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
    });

    // Drop
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');

        var files = e.dataTransfer.files;
        if (files.length > 0) {
            var file = files[0];
            if (file.name.endsWith('.zip')) {
                fileInput.files = files;
                showFileInfo(file);
                enableUploadBtn();
            } else {
                alert('Seuls les fichiers ZIP sont acceptes.');
            }
        }
    });

    // File input change (click selection)
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            showFileInfo(this.files[0]);
            enableUploadBtn();
        } else {
            hideFileInfo();
            disableUploadBtn();
        }
    });
}

function showFileInfo(file) {
    var fileInfo = document.getElementById('fileInfo');
    var fileName = document.getElementById('fileName');
    var fileSize = document.getElementById('fileSize');
    var zone = document.getElementById('uploadArea');

    if (fileInfo) fileInfo.style.display = 'flex';
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = '(' + (file.size / 1024 / 1024).toFixed(2) + ' Mo)';

    if (zone) {
        zone.style.borderColor = '#16a34a';
        zone.style.background = '#f0fdf4';
        var content = zone.querySelector('.upload-zone-content');
        if (content) {
            content.querySelector('h3').textContent = 'Fichier selectionne !';
            content.querySelector('h3').style.color = '#16a34a';
        }
    }
}

function hideFileInfo() {
    var fileInfo = document.getElementById('fileInfo');
    var zone = document.getElementById('uploadArea');

    if (fileInfo) fileInfo.style.display = 'none';
    if (zone) {
        zone.style.borderColor = '';
        zone.style.background = '';
        var content = zone.querySelector('.upload-zone-content');
        if (content) {
            content.querySelector('h3').textContent = 'Glissez-deposez votre fichier ZIP ici';
            content.querySelector('h3').style.color = '';
        }
    }
}

function enableUploadBtn() {
    var btn = document.getElementById('uploadBtn');
    if (btn) btn.disabled = false;
}

function disableUploadBtn() {
    var btn = document.getElementById('uploadBtn');
    if (btn) btn.disabled = true;
}

function clearFile() {
    var fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    hideFileInfo();
    disableUploadBtn();
}

// ============================================================
// Alert Auto-dismiss
// ============================================================

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
// Generation - AJAX with synchronized progress animation
// ============================================================

var generationInProgress = false;

function launchTransformation() {
    if (generationInProgress) return;
    generationInProgress = true;

    var progressContainer = document.getElementById('progressContainer');
    var progressBar = document.getElementById('progressBar');
    var progressText = document.getElementById('progressText');
    var generateBtn = document.getElementById('generateBtn');

    // Show progress UI
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressText) {
        progressText.style.display = 'block';
        progressText.textContent = 'Initialisation de la transformation...';
    }
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transformation en cours...';
    }

    // Animation steps (visual feedback)
    var steps = [
        { pct: 10, msg: 'Parsing du code EJB avec JavaParser...', stepId: 'step-parsing' },
        { pct: 25, msg: 'Generation des Controllers REST...', stepId: 'step-generation' },
        { pct: 40, msg: 'Generation des Service Adapters et DTOs...', stepId: null },
        { pct: 55, msg: 'Application des regles SmartCodeEnhancer...', stepId: 'step-enhancement' },
        { pct: 70, msg: 'Generation des tests unitaires...', stepId: null },
        { pct: 80, msg: 'Packaging du projet...', stepId: 'step-packaging' }
    ];

    var stepIndex = 0;
    var animationDone = false;
    var serverDone = false;
    var serverResult = null;

    // Start animation
    var interval = setInterval(function() {
        if (stepIndex < steps.length) {
            var step = steps[stepIndex];
            if (progressBar) progressBar.style.width = step.pct + '%';
            if (progressText) progressText.textContent = step.msg;
            addLogEntry('INFO', step.msg);

            // Mark step as active (spinning)
            if (step.stepId) {
                var stepEl = document.getElementById(step.stepId);
                if (stepEl) {
                    stepEl.classList.add('gen-step-active');
                    var statusEl = stepEl.querySelector('.gen-step-status');
                    if (statusEl) {
                        statusEl.innerHTML = '<span class="badge badge-warning"><i class="fas fa-spinner fa-spin"></i> En cours</span>';
                    }
                }
            }

            stepIndex++;
        } else {
            clearInterval(interval);
            animationDone = true;
            checkCompletion();
        }
    }, 900);

    // Check BIAN mode
    var bianToggle = document.getElementById('bianModeToggle');
    var bianMode = bianToggle ? bianToggle.checked : false;
    if (bianMode) {
        addLogEntry('INFO', 'Mode BIAN active - URLs conformes au standard BIAN');
    }

    // Start AJAX call to server
    fetch('/api/generate?bianMode=' + bianMode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        serverDone = true;
        serverResult = data;
        checkCompletion();
    })
    .catch(function(error) {
        serverDone = true;
        serverResult = { success: false, error: 'Erreur de connexion : ' + error.message };
        checkCompletion();
    });

    // Called when both animation and server are done
    function checkCompletion() {
        if (!animationDone || !serverDone) return;

        // Finish the progress bar
        if (serverResult && serverResult.success) {
            // Success path
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = 'Transformation terminee !';
            addLogEntry('SUCCESS', 'Transformation terminee !');
            addLogEntry('SUCCESS', 'Score qualite IA : ' + serverResult.qualityScore + '/100, ' +
                serverResult.totalRulesApplied + '/' + serverResult.totalRulesChecked + ' regles appliquees');

            // Mark all steps as done
            markAllStepsDone();

            // Show success message
            showAlert('success', serverResult.message);

            // Auto-redirect to results after 2 seconds
            setTimeout(function() {
                window.location.href = '/results';
            }, 2500);

        } else {
            // Error path
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.background = '#ef4444';
            }
            if (progressText) progressText.textContent = 'Erreur lors de la transformation';
            addLogEntry('ERROR', serverResult ? serverResult.error : 'Erreur inconnue');

            showAlert('error', serverResult ? serverResult.error : 'Erreur inconnue');

            // Re-enable button
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-rocket"></i> Relancer la transformation';
            }
            generationInProgress = false;
        }
    }
}

function markAllStepsDone() {
    var stepIds = ['step-parsing', 'step-generation', 'step-enhancement', 'step-packaging'];
    stepIds.forEach(function(id) {
        var stepEl = document.getElementById(id);
        if (stepEl) {
            stepEl.classList.remove('gen-step-active');
            stepEl.classList.add('gen-step-done');
            var statusEl = stepEl.querySelector('.gen-step-status');
            if (statusEl) {
                statusEl.innerHTML = '<span class="badge badge-success"><i class="fas fa-check"></i> Termine</span>';
            }
        }
    });
}

function showAlert(type, message) {
    var alertsContainer = document.querySelector('.page-alerts');
    if (!alertsContainer) return;

    var alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    var iconClass = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';

    var alertDiv = document.createElement('div');
    alertDiv.className = 'alert ' + alertClass;
    alertDiv.innerHTML = '<i class="fas ' + iconClass + '"></i> <span>' + escapeHtml(message) + '</span>';
    alertsContainer.appendChild(alertDiv);

    // Auto-dismiss
    setTimeout(function() {
        alertDiv.style.transition = 'opacity 0.5s';
        alertDiv.style.opacity = '0';
        setTimeout(function() { alertDiv.remove(); }, 500);
    }, 10000);
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

// ============================================================
// BIAN Mode Toggle
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    var bianToggle = document.getElementById('bianModeToggle');
    var bianDesc = document.getElementById('bianDescription');
    if (bianToggle && bianDesc) {
        bianToggle.addEventListener('change', function() {
            bianDesc.style.display = this.checked ? 'block' : 'none';
        });
    }
});
