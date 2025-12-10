let currentFilter = 'all';
let isAdmin = false;
const ADMIN_PASSWORD = 'koshelev'; // замените на свой пароль
const materialsState = [];
const STORAGE_KEY = 'bank_znaniy_materials';

// Настройки синхронизации через GitHub Gist
// ИНСТРУКЦИЯ:
// 1) Зайдите на https://github.com/settings/tokens
// 2) Нажмите "Generate new token" -> "Generate new token (classic)"
// 3) Дайте токену имя (например: "Банк знаний")
// 4) Выберите срок действия (рекомендуется: "No expiration")
// 5) Отметьте галочку "gist" (разрешение на работу с Gist)
// 6) Нажмите "Generate token" и скопируйте токен
// 7) Создайте новый Gist на https://gist.github.com (кнопка "+" в правом верхнем углу)
// 8) Назовите файл: materials.json
// 9) Вставьте содержимое: []
// 10) Выберите "Create public gist" или "Create secret gist"
// 11) Скопируйте Gist ID из URL (например: https://gist.github.com/username/abc123def456 -> ID: abc123def456)
// 12) Вставьте значения ниже
const GITHUB_GIST_ID = 'bc7cb824c66c437541cd4746f29c7475'; // Вставьте Gist ID сюда (например: 'abc123def456')
const GITHUB_TOKEN = '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'; // Вставьте Personal Access Token сюда
const USE_GITHUB_SYNC = GITHUB_GIST_ID && GITHUB_TOKEN; // Автоматически определяется

// Загрузка материалов из localStorage и GitHub
async function loadMaterialsFromStorage() {
    // Сначала загружаем из localStorage для быстрого отображения
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const materials = JSON.parse(stored);
            materials.forEach(material => {
                restoreMaterialFromData(material);
            });
        } catch (e) {
            console.error('Ошибка при загрузке из localStorage:', e);
        }
    }
    
    // Затем загружаем из GitHub (если настроено)
    if (USE_GITHUB_SYNC) {
        try {
            await loadMaterialsFromGitHub();
        } catch (e) {
            console.error('Ошибка при загрузке из GitHub:', e);
        }
    }
}


// Восстановление материала из данных
function restoreMaterialFromData(material) {
    // Восстанавливаем blob URL из base64
    const byteCharacters = atob(material.fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: material.fileType });
    material.fileUrl = URL.createObjectURL(blob);
    
    // Проверяем, нет ли уже такого материала
    const exists = materialsState.find(m => m.id === material.id);
    if (!exists) {
        materialsState.push(material);
        addMaterialCard(material);
    }
    
    const emptyState = document.getElementById('emptyState');
    if (emptyState && materialsState.length > 0) {
        emptyState.style.display = 'none';
    }
}

// Сохранение материалов в localStorage
function saveMaterialsToStorageLocal() {
    try {
        // Сохраняем только необходимые данные, без временного fileUrl
        const materialsToSave = materialsState.map(material => ({
            id: material.id,
            subject: material.subject,
            topic: material.topic,
            type: material.type,
            fileName: material.fileName,
            fileType: material.fileType || 'application/octet-stream',
            fileData: material.fileData,
            date: material.date
        }));
        
        const jsonData = JSON.stringify(materialsToSave);
        
        // Проверка размера данных перед сохранением
        const dataSize = new Blob([jsonData]).size;
        const maxStorageSize = 4 * 1024 * 1024; // ~4MB (localStorage обычно ограничен 5-10MB)
        
        if (dataSize > maxStorageSize) {
            throw new Error('QUOTA_EXCEEDED');
        }
        
        localStorage.setItem(STORAGE_KEY, jsonData);
        
        // Проверяем, что данные действительно сохранились
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved || saved !== jsonData) {
            throw new Error('Данные не были сохранены');
        }
        
        return Promise.resolve();
    } catch (e) {
        console.error('Ошибка при сохранении материалов:', e);
        if (e.name === 'QuotaExceededError' || e.message === 'QUOTA_EXCEEDED') {
            const error = new Error('Превышен лимит хранилища');
            error.name = 'QuotaExceededError';
            return Promise.reject(error);
        }
        return Promise.reject(e);
    }
}

// Загрузка материалов из GitHub Gist
async function loadMaterialsFromGitHub() {
    if (!USE_GITHUB_SYNC) return;
    
    try {
        const url = `https://api.github.com/gists/${GITHUB_GIST_ID}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Ищем файл materials.json в Gist
            const files = data.files;
            let materials = [];
            
            // Проверяем все файлы в Gist
            for (const fileName in files) {
                if (fileName.includes('materials') || fileName.includes('.json')) {
                    try {
                        const content = files[fileName].content;
                        materials = JSON.parse(content);
                        if (Array.isArray(materials)) {
                            break;
                        }
                    } catch (e) {
                        console.error('Ошибка парсинга файла из Gist:', e);
                    }
                }
            }
            
            if (Array.isArray(materials) && materials.length > 0) {
                let importedCount = 0;
                materials.forEach(material => {
                    const exists = materialsState.find(m => m.id === material.id);
                    if (!exists) {
                        restoreMaterialFromData(material);
                        importedCount++;
                    }
                });
                
                if (importedCount > 0) {
                    await saveMaterialsToStorageLocal();
                    console.log(`Загружено ${importedCount} новых материалов из GitHub`);
                }
            }
        } else {
            console.error('Ошибка при загрузке из GitHub:', response.status);
        }
    } catch (e) {
        console.error('Ошибка при загрузке из GitHub:', e);
    }
}

// Сохранение материалов в GitHub Gist
async function saveMaterialsToGitHub() {
    if (!USE_GITHUB_SYNC) return;
    
    try {
        const materialsToSave = materialsState.map(material => ({
            id: material.id,
            subject: material.subject,
            topic: material.topic,
            type: material.type,
            fileName: material.fileName,
            fileType: material.fileType || 'application/octet-stream',
            fileData: material.fileData,
            date: material.date
        }));
        
        // Сначала получаем текущий Gist для получения всех файлов
        const getUrl = `https://api.github.com/gists/${GITHUB_GIST_ID}`;
        const getResponse = await fetch(getUrl, {
            method: 'GET',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!getResponse.ok) {
            throw new Error('Не удалось получить Gist');
        }
        
        const gistData = await getResponse.json();
        const files = {};
        
        // Сохраняем все существующие файлы
        for (const fileName in gistData.files) {
            files[fileName] = {
                content: gistData.files[fileName].content
            };
        }
        
        // Обновляем или создаем файл materials.json
        files['materials.json'] = {
            content: JSON.stringify(materialsToSave, null, 2)
        };
        
        // Обновляем Gist
        const updateUrl = `https://api.github.com/gists/${GITHUB_GIST_ID}`;
        const updateResponse = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: files
            })
        });
        
        if (updateResponse.ok) {
            console.log('Материалы успешно сохранены в GitHub Gist');
        } else {
            const errorText = await updateResponse.text();
            console.error('Ошибка при сохранении в GitHub:', updateResponse.status, errorText);
            throw new Error(`Ошибка сохранения: ${updateResponse.status}`);
        }
    } catch (e) {
        console.error('Ошибка при сохранении в GitHub:', e);
        throw e;
    }
}

// Сохранение материалов в localStorage и GitHub
async function saveMaterialsToStorage() {
    await saveMaterialsToStorageLocal();
    // Автоматически сохраняем в GitHub (если настроено)
    if (USE_GITHUB_SYNC) {
        try {
            await saveMaterialsToGitHub();
        } catch (e) {
            console.error('Ошибка сохранения в GitHub:', e);
            // Не показываем ошибку пользователю, чтобы не мешать работе
        }
    }
}

function filter(type, targetButton) {
    currentFilter = type;
    const materials = document.querySelectorAll('.material');
    const buttons = document.querySelectorAll('.filter-btn');

    buttons.forEach(btn => btn.classList.remove('active'));
    if (targetButton) {
        targetButton.classList.add('active');
    }

    materials.forEach(material => {
        if (type === 'all' || material.dataset.type === type) {
            material.style.display = 'block';
        } else {
            material.style.display = 'none';
        }
    });
}

function search() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dateInput = document.getElementById('dateInput');
    const selectedDate = dateInput ? dateInput.value : '';
    const materials = document.querySelectorAll('.material');

    materials.forEach(material => {
        const text = material.textContent.toLowerCase();
        const materialDate = material.dataset.date || '';
        
        // Поиск по тексту
        const textMatches = !searchTerm || text.includes(searchTerm);
        
        // Поиск по дате
        let dateMatches = true;
        if (selectedDate) {
            // Преобразуем дату материала в формат YYYY-MM-DD для сравнения
            const materialDateFormatted = formatDateForSearch(materialDate);
            dateMatches = materialDateFormatted === selectedDate;
        }
        
        const typeMatch = currentFilter === 'all' || material.dataset.type === currentFilter;

        if (textMatches && dateMatches && typeMatch) {
            material.style.display = 'block';
        } else {
            material.style.display = 'none';
        }
    });
}

// Преобразование даты из формата DD.MM.YYYY в YYYY-MM-DD для поиска
function formatDateForSearch(dateStr) {
    if (!dateStr) return '';
    // Формат даты: DD.MM.YYYY
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    return '';
}

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        search();
    }
});

// Поиск при изменении даты
const dateInput = document.getElementById('dateInput');
if (dateInput) {
    dateInput.addEventListener('change', function() {
        search();
    });
}

function upload() {
    if (!isAdmin) {
        alert('Только администратор может загружать материалы. Введите пароль в блоке "Администрирование".');
        return;
    }

    const subjectInput = document.getElementById('subjectInput');
    const topicInput = document.getElementById('topicInput');
    const typeSelect = document.getElementById('typeSelect');
    const fileInput = document.getElementById('fileInput');
    const emptyState = document.getElementById('emptyState');

    if (!subjectInput || !topicInput || !typeSelect || !fileInput) return;

    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();
    const type = typeSelect.value;
    const file = fileInput.files[0];

    if (!subject || !topic) {
        alert('Введите предмет и тему.');
        return;
    }

    if (!file) {
        alert('Прикрепите файл (изображение или документ).');
        return;
    }

    // Проверка размера файла (ограничение ~5MB для мобильных устройств)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        alert(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(2)} MB). Максимальный размер: 5 MB.`);
        return;
    }

    // Конвертируем файл в base64 для сохранения
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const fileData = e.target.result.split(',')[1]; // убираем префикс data:type;base64,
            const createdAt = new Date();
            const displayDate = createdAt.toLocaleDateString('ru-RU');
            const fileUrl = URL.createObjectURL(file);

            const newMaterial = {
                id: Date.now().toString(),
                subject,
                topic,
                type,
                fileName: file.name,
                fileType: file.type || 'application/octet-stream',
                fileData: fileData,
                fileUrl: fileUrl,
                date: displayDate,
            };

            materialsState.push(newMaterial);
            addMaterialCard(newMaterial);
            
            // Сохраняем с обработкой ошибок
            try {
                await saveMaterialsToStorage();
                alert('Материал добавлен и сохранен!');
            } catch (saveError) {
                console.error('Ошибка сохранения:', saveError);
                // Удаляем материал из состояния, если не удалось сохранить
                const index = materialsState.indexOf(newMaterial);
                if (index > -1) {
                    materialsState.splice(index, 1);
                }
                // Удаляем карточку
                const card = document.querySelector(`[data-material-id="${newMaterial.id}"]`);
                if (card) {
                    card.remove();
                }
                
                if (saveError.name === 'QuotaExceededError') {
                    alert('Ошибка: Превышен лимит хранилища браузера. Удалите старые материалы или используйте файлы меньшего размера.');
                } else {
                    alert('Ошибка при сохранении материала. Попробуйте еще раз или используйте файл меньшего размера.');
                }
                return;
            }

            if (emptyState) {
                emptyState.style.display = 'none';
            }

            subjectInput.value = '';
            topicInput.value = '';
            typeSelect.value = 'notes';
            fileInput.value = '';
        } catch (error) {
            console.error('Ошибка при обработке файла:', error);
            alert('Ошибка при обработке файла. Попробуйте еще раз.');
        }
    };
    
    reader.onerror = function(error) {
        console.error('Ошибка чтения файла:', error);
        alert('Ошибка при чтении файла. Проверьте, что файл не поврежден, и попробуйте еще раз.');
    };
    
    reader.readAsDataURL(file);
}

function adminLogin() {
    const passwordInput = document.getElementById('adminPassword');
    const status = document.getElementById('adminStatus');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!passwordInput || !status || !uploadBtn) return;

    const value = passwordInput.value.trim();
    if (value === ADMIN_PASSWORD) {
        isAdmin = true;
        status.textContent = 'Режим администратора: включен';
        status.classList.add('admin-status--active');
        uploadBtn.disabled = false;
        alert('Администраторский режим активирован.');
    } else {
        isAdmin = false;
        status.textContent = 'Режим администратора: выключен';
        status.classList.remove('admin-status--active');
        uploadBtn.disabled = true;
        alert('Неверный пароль администратора.');
    }
}

function addMaterialCard(material) {
    const materialsContainer = document.getElementById('materials');
    if (!materialsContainer) return;

    const typeIcons = {
        notes: '📝 Конспект',
        cheat: '📋 Шпаргалка',
        homework: '📚 Домашняя работа',
    };

    const card = document.createElement('div');
    card.className = 'material';
    card.dataset.type = material.type;
    card.dataset.date = material.date; // Сохраняем дату для поиска
    card.setAttribute('data-material-id', material.id); // Добавляем ID для возможности удаления

    const title = document.createElement('h3');
    title.textContent = `${material.subject}: ${material.topic}`;

    const info = document.createElement('div');
    info.className = 'info';
    info.textContent = `${typeIcons[material.type] || 'Материал'} • ${material.subject} • ${material.date}`;

    const desc = document.createElement('p');
    desc.textContent = `Файл: ${material.fileName}`;

    // Превью для изображений
    const previewContainer = document.createElement('div');
    previewContainer.className = 'material-preview';
    
    const isImage = material.fileType && material.fileType.startsWith('image/');
    if (isImage) {
        const previewImg = document.createElement('img');
        previewImg.src = material.fileUrl;
        previewImg.alt = material.topic;
        previewImg.className = 'preview-image';
        previewImg.onclick = function() {
            window.open(material.fileUrl, '_blank');
        };
        previewContainer.appendChild(previewImg);
    }

    const link = document.createElement('a');
    const isTextFile = material.fileType && (
        material.fileType.startsWith('text/') || 
        material.fileName.endsWith('.txt') || 
        material.fileName.endsWith('.md')
    );
    
    if (isTextFile) {
        // Для текстовых файлов создаем обработчик, который правильно декодирует содержимое
        link.href = '#';
        link.className = 'material-link';
        link.textContent = 'Открыть документ';
        link.onclick = function(e) {
            e.preventDefault();
            openTextFile(material);
        };
    } else {
        link.href = material.fileUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'material-link';
        link.textContent = isImage ? 'Открыть изображение' : 'Открыть файл';
    }

    const tags = document.createElement('div');
    tags.className = 'tags';
    const subjectTag = document.createElement('span');
    subjectTag.className = 'tag';
    subjectTag.textContent = material.subject;
    const dateTag = document.createElement('span');
    dateTag.className = 'tag';
    dateTag.textContent = material.date;

    tags.appendChild(subjectTag);
    tags.appendChild(dateTag);

    card.appendChild(title);
    card.appendChild(info);
    if (isImage) {
        card.appendChild(previewContainer);
    }
    card.appendChild(desc);
    card.appendChild(link);
    card.appendChild(tags);

    materialsContainer.prepend(card);
    filter(currentFilter); // обновляем видимость по текущему фильтру
    search(); // учитываем активный поисковый запрос
}

// Открытие текстового файла с правильной кодировкой
function openTextFile(material) {
    try {
        // Декодируем base64 в текст с правильной кодировкой UTF-8
        const byteCharacters = atob(material.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Преобразуем байты в строку UTF-8
        const textContent = new TextDecoder('utf-8').decode(byteArray);
        
        // Создаем новое окно с правильной кодировкой
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>${material.fileName}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 800px;
                            margin: 20px auto;
                            padding: 20px;
                            background: #f5f5f5;
                        }
                        pre {
                            background: white;
                            padding: 20px;
                            border-radius: 5px;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            font-size: 14px;
                            line-height: 1.6;
                        }
                        h1 {
                            color: #4a90e2;
                            margin-bottom: 10px;
                        }
                    </style>
                </head>
                <body>
                    <h1>${material.fileName}</h1>
                    <pre>${escapeHtml(textContent)}</pre>
                </body>
                </html>
            `);
            newWindow.document.close();
        }
    } catch (e) {
        console.error('Ошибка при открытии текстового файла:', e);
        alert('Не удалось открыть текстовый файл. Попробуйте еще раз.');
    }
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Автоматическая синхронизация с GitHub
function startAutoSync() {
    if (!USE_GITHUB_SYNC) return;
    
    // Синхронизируем каждые 60 секунд
    setInterval(async () => {
        try {
            await loadMaterialsFromGitHub();
        } catch (e) {
            console.error('Ошибка автоматической синхронизации:', e);
        }
    }, 60000); // 60 секунд
    
    console.log('Автоматическая синхронизация с GitHub запущена');
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async function() {
    await loadMaterialsFromStorage();
    
    // Запускаем автоматическую синхронизацию, если GitHub настроен
    if (USE_GITHUB_SYNC) {
        startAutoSync();
        
        // Синхронизируем при возврате на вкладку
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && USE_GITHUB_SYNC) {
                setTimeout(() => {
                    loadMaterialsFromGitHub().catch(e => console.error('Ошибка синхронизации:', e));
                }, 1000);
            }
        });
    }
});

