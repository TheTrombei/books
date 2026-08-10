// --- BASE DE DATOS INDEXEDDB ---
const DB_NAME = '3DBookshelfDB';
const DB_VERSION = 1;
let db = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains('books')) {
                dbInstance.createObjectStore('books', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
}

function getAllBooksFromDB() {
    return new Promise((resolve) => {
        if (!db) return resolve([]);
        const tx = db.transaction('books', 'readonly');
        const store = tx.objectStore('books');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

function saveBookToDB(book) {
    return new Promise((resolve) => {
        const tx = db.transaction('books', 'readwrite');
        const store = tx.objectStore('books');
        store.put(book);
        tx.oncomplete = () => resolve();
    });
}

function deleteBookFromDB(id) {
    return new Promise((resolve) => {
        const tx = db.transaction('books', 'readwrite');
        const store = tx.objectStore('books');
        store.delete(id);
        tx.oncomplete = () => resolve();
    });
}

// --- ESCENA Y CÁMARA ADAPTATIVA ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x160e08);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffebd2, 0.9);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xfff5e6, 1.4);
spotLight.position.set(0, 16, 18);
spotLight.angle = Math.PI / 3;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
scene.add(spotLight);

// --- FONDO Y TEXTURA DE MADERA ---
function generateWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#63381a';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(30, 12, 4, ${Math.random() * 0.28})`;
        ctx.fillRect(Math.random() * 512, 0, Math.random() * 6 + 1, 512);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    tex.needsUpdate = true;
    return tex;
}

const WOOD_MAT = new THREE.MeshStandardMaterial({
    map: generateWoodTexture(),
    roughness: 0.45,
    metalness: 0.05
});

const wallGeo = new THREE.PlaneGeometry(55, 30);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x24140a, roughness: 0.9 });
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(0, 6, -1.5);
scene.add(wallMesh);

// --- ESTADO LOCAL ---
let shelfNames = JSON.parse(localStorage.getItem('my_3d_shelf_names_v6')) || ["Estantería 1", "Estantería 2", "Estantería 3"];
let booksData = [];

const shelfGroups = [];
const bookMeshes = [];
const labelMeshes = [];

let currentShelfIndex = 1;
let currentSelectedShelf = null;
let currentInspectedBook = null;
let isFlipped = false;

function updateCameraFOV() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 1.0) {
        camera.fov = 65;
        camera.position.set(0, 3.8, 20.0);
    } else {
        camera.fov = 45;
        camera.position.set(0, 3.6, 15.5);
    }
    camera.updateProjectionMatrix();
}

updateCameraFOV();

// --- CARTELES DE TEXTO DE ESTANTERÍA ---
function createShelfLabelTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#22140a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#c8963e';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = '#fce8bd';
    ctx.font = 'bold 36px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

// --- CONSTRUCCIÓN DE ESTANTERÍAS ---
function createBookshelf(xPos, index) {
    const group = new THREE.Group();
    const width = 5.6, height = 7.0, depth = 0.85;

    const backGeo = new THREE.BoxGeometry(width, height, 0.08);
    const backMesh = new THREE.Mesh(backGeo, WOOD_MAT);
    backMesh.position.set(0, height / 2, -depth / 2);
    group.add(backMesh);

    const sideGeo = new THREE.BoxGeometry(0.12, height, depth);
    const leftSide = new THREE.Mesh(sideGeo, WOOD_MAT);
    leftSide.position.set(-width / 2 + 0.06, height / 2, 0);
    const rightSide = new THREE.Mesh(sideGeo, WOOD_MAT);
    rightSide.position.set(width / 2 - 0.06, height / 2, 0);
    group.add(leftSide, rightSide);

    const shelfGeo = new THREE.BoxGeometry(width, 0.12, depth);
    const levelsY = [0.15, 1.45, 2.75, 4.05, 5.35, 6.65];
    levelsY.forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, WOOD_MAT);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        shelf.castShadow = true;
        group.add(shelf);
    });

    const labelGeo = new THREE.PlaneGeometry(3.2, 0.8);
    const labelMat = new THREE.MeshBasicMaterial({ map: createShelfLabelTexture(shelfNames[index]), side: THREE.DoubleSide });
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.position.set(0, height + 0.5, 0);
    group.add(labelMesh);
    labelMeshes[index] = labelMesh;

    group.position.set(xPos, -0.2, 0);
    group.userData = { id: index, targetX: xPos, targetY: 3.2 };
    scene.add(group);
    shelfGroups.push(group);
}

function initShelves() {
    createBookshelf(-6.2, 0);
    createBookshelf(0, 1);
    createBookshelf(6.2, 2);
    updateShelfDropdownOptions();
}

function updateShelfLabels() {
    shelfNames.forEach((name, i) => {
        if (labelMeshes[i]) {
            labelMeshes[i].material.map = createShelfLabelTexture(name);
            labelMeshes[i].material.map.needsUpdate = true;
        }
    });
}

// --- RENDERIZADO DE LIBROS ---
function loadTextureAsync(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        const loader = new THREE.TextureLoader();
        loader.load(url, (tex) => resolve(tex), undefined, () => resolve(null));
    });
}

async function renderBooks() {
    bookMeshes.forEach(b => {
        scene.remove(b);
        if (b.geometry) b.geometry.dispose();
        if (Array.isArray(b.material)) b.material.forEach(m => m.dispose());
    });
    bookMeshes.length = 0;

    booksData = await getAllBooksFromDB();
    const shelfTrackers = {};
    const levelYArray = [0.72, 2.02, 3.32, 4.62, 5.92];

    for (const data of booksData) {
        const sIdx = data.shelfIndex;
        const lIdx = data.levelIndex || 0;
        const key = `${sIdx}_${lIdx}`;

        if (!shelfTrackers[key]) shelfTrackers[key] = -2.55;

        const spineThickness = Math.min(data.spineThickness || 0.12, 0.22);
        const bookHeight = 1.0;
        const bookCoverWidth = 0.7;

        const geometry = new THREE.BoxGeometry(spineThickness, bookHeight, bookCoverWidth);

        const coverTex = await loadTextureAsync(data.coverImg);
        const spineTex = await loadTextureAsync(data.spineImg);

        const materials = [
            coverTex ? new THREE.MeshStandardMaterial({ map: coverTex }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x222222 }),
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }),
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }),
            spineTex ? new THREE.MeshStandardMaterial({ map: spineTex }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        ];

        const bookMesh = new THREE.Mesh(geometry, materials);
        const shelfGroup = shelfGroups[sIdx];
        const levelY = levelYArray[lIdx];

        const currentX = shelfTrackers[key] + (spineThickness / 2);
        shelfTrackers[key] += spineThickness + 0.02;

        const worldX = shelfGroup.position.x + currentX;
        const worldY = shelfGroup.position.y + levelY;
        const worldZ = 0.1;

        bookMesh.position.set(worldX, worldY, worldZ);
        bookMesh.rotation.set(0, 0, 0);
        bookMesh.castShadow = true;

        bookMesh.userData = {
            ...data,
            homePos: { x: worldX, y: worldY, z: worldZ },
            homeRot: { x: 0, y: 0, z: 0 }
        };

        scene.add(bookMesh);
        bookMeshes.push(bookMesh);
    }
}

// --- MANEJO DE EVENTOS TÁCTILES EXCLUSIVAMENTE SOBRE EL LIENZO 3D ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let startX = 0;
let startY = 0;

const domCanvas = renderer.domElement;

domCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }
}, { passive: true });

domCanvas.addEventListener('touchend', (e) => {
    if (!e.changedTouches || e.changedTouches.length === 0) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;

    const diffX = endX - startX;
    const diffY = endY - startY;
    const dist = Math.hypot(diffX, diffY);

    // Si se movió más de 35px en horizontal -> Gesto Swipe
    if (dist > 35 && Math.abs(diffX) > Math.abs(diffY) && !currentInspectedBook) {
        if (diffX < 0) {
            navigateShelf(1);  // Swipe a la izquierda -> Siguiente estantería
        } else {
            navigateShelf(-1); // Swipe a la derecha -> Anterior estantería
        }
        return;
    }

    // Si fue un toque rápido sin arrastrar -> Selección de objeto 3D
    if (dist < 15) {
        process3DInteraction(endX, endY);
    }
}, { passive: true });

domCanvas.addEventListener('click', (e) => {
    // Para clics normales con mouse en PC
    if (e.pointerType === 'touch') return;
    process3DInteraction(e.clientX, e.clientY);
});

function process3DInteraction(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const bookHits = raycaster.intersectObjects(bookMeshes);
    if (bookHits.length > 0) {
        inspectBook(bookHits[0].object);
        return;
    }

    if (!currentSelectedShelf && !currentInspectedBook) {
        const shelfHits = raycaster.intersectObjects(shelfGroups.flatMap(g => g.children));
        if (shelfHits.length > 0) {
            let parent = shelfHits[0].object.parent;
            while (parent && !parent.userData.hasOwnProperty('targetX')) parent = parent.parent;
            if (parent) focusShelf(parent);
        }
    }
}

// Navegación por flechas UI o gestos
function navigateShelf(direction) {
    if (currentInspectedBook) return;

    let targetIdx = currentShelfIndex + direction;
    targetIdx = Math.max(0, Math.min(2, targetIdx));

    currentShelfIndex = targetIdx;
    focusShelf(shelfGroups[currentShelfIndex]);
}

// Asignación explícita de eventos a los botones UI
document.getElementById('btn-prev-shelf').onclick = (e) => {
    e.stopPropagation();
    navigateShelf(-1);
};

document.getElementById('btn-next-shelf').onclick = (e) => {
    e.stopPropagation();
    navigateShelf(1);
};

function focusShelf(shelfGroup) {
    currentSelectedShelf = shelfGroup;
    currentShelfIndex = shelfGroup.userData.id;

    document.getElementById('btn-reset-cam').classList.remove('hidden');
    document.getElementById('btn-rename-shelf').classList.remove('hidden');
    document.getElementById('shelf-title-display').innerText = shelfNames[shelfGroup.userData.id];

    gsap.to(camera.position, {
        x: shelfGroup.userData.targetX,
        y: shelfGroup.userData.targetY,
        z: 5.6,
        duration: 1.2,
        ease: 'power2.inOut'
    });
}

document.getElementById('btn-reset-cam').onclick = (e) => {
    e.stopPropagation();
    if (currentInspectedBook) returnBookHome();
    currentSelectedShelf = null;
    document.getElementById('btn-reset-cam').classList.add('hidden');
    document.getElementById('btn-rename-shelf').classList.add('hidden');
    document.getElementById('shelf-title-display').innerText = "Biblioteca Virtual 3D";

    const isPortrait = window.innerHeight > window.innerWidth;
    gsap.to(camera.position, {
        x: 0,
        y: isPortrait ? 3.8 : 3.6,
        z: isPortrait ? 20.0 : 15.5,
        duration: 1.2,
        ease: 'power2.inOut'
    });
};

// --- CENTRADO E INSPECCIÓN ---
function inspectBook(bookMesh) {
    if (currentInspectedBook) returnBookHome();
    currentInspectedBook = bookMesh;
    isFlipped = false;

    const targetVector = new THREE.Vector3(0, 0, -2.2);
    targetVector.applyMatrix4(camera.matrixWorld);

    gsap.to(bookMesh.position, {
        x: targetVector.x,
        y: targetVector.y,
        z: targetVector.z,
        duration: 0.9,
        ease: 'power2.out'
    });

    gsap.to(bookMesh.rotation, {
        x: camera.rotation.x,
        y: camera.rotation.y,
        z: camera.rotation.z,
        duration: 0.9
    });

    document.getElementById('card-title').innerText = bookMesh.userData.title;
    document.getElementById('card-author').innerText = `Autor: ${bookMesh.userData.author}`;
    document.getElementById('book-info-card').classList.remove('hidden');
}

document.getElementById('btn-flip-book').onclick = (e) => {
    e.stopPropagation();
    if (!currentInspectedBook) return;
    isFlipped = !isFlipped;
    const targetY = camera.rotation.y + (isFlipped ? -Math.PI / 2 : 0);

    gsap.to(currentInspectedBook.rotation, {
        y: targetY,
        duration: 0.8,
        ease: 'power2.inOut'
    });
};

function returnBookHome() {
    if (!currentInspectedBook) return;
    const home = currentInspectedBook.userData.homePos;
    const rot = currentInspectedBook.userData.homeRot;

    gsap.to(currentInspectedBook.position, { x: home.x, y: home.y, z: home.z, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(currentInspectedBook.rotation, { x: rot.x, y: rot.y, z: rot.z, duration: 0.8 });

    currentInspectedBook = null;
    document.getElementById('book-info-card').classList.add('hidden');
}

document.getElementById('btn-close-inspect').onclick = (e) => {
    e.stopPropagation();
    returnBookHome();
};

// --- RENOMBRAR ESTANTERÍAS ---
document.getElementById('btn-rename-shelf').onclick = (e) => {
    e.stopPropagation();
    if (!currentSelectedShelf) return;
    const sId = currentSelectedShelf.userData.id;
    const newName = prompt("Nuevo nombre para esta estantería:", shelfNames[sId]);
    if (newName && newName.trim() !== "") {
        shelfNames[sId] = newName.trim();
        localStorage.setItem('my_3d_shelf_names_v6', JSON.stringify(shelfNames));
        document.getElementById('shelf-title-display').innerText = shelfNames[sId];
        updateShelfLabels();
        updateShelfDropdownOptions();
    }
};

function updateShelfDropdownOptions() {
    const select = document.getElementById('select-shelf');
    select.innerHTML = '';
    shelfNames.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = name;
        select.appendChild(opt);
    });
}

// --- PROCESAMIENTO DE IMÁGENES ---
function processSpineImage(file) {
    return new Promise((resolve) => {
        if (!file) resolve({ base64: null, thickness: 0.12 });
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const aspect = img.width / img.height;
                let calculatedThickness = 1.0 * aspect;
                calculatedThickness = Math.max(0.06, Math.min(0.22, calculatedThickness));
                resolve({ base64: e.target.result, thickness: calculatedThickness });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

const readFileAsBase64 = (file) => {
    return new Promise((resolve) => {
        if (!file) resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
};

document.getElementById('form-book').onsubmit = async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-form');
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Guardando...";

    const spineFile = document.getElementById('input-spine-file').files[0];
    const coverFile = document.getElementById('input-cover-file').files[0];

    const spineData = await processSpineImage(spineFile);
    const coverImg = await readFileAsBase64(coverFile);

    const newBook = {
        id: 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: document.getElementById('input-title').value,
        author: document.getElementById('input-author').value,
        shelfIndex: parseInt(document.getElementById('select-shelf').value),
        levelIndex: parseInt(document.getElementById('select-level').value),
        spineImg: spineData.base64,
        spineThickness: spineData.thickness,
        coverImg: coverImg
    };

    await saveBookToDB(newBook);
    await renderBooks();

    btnSubmit.disabled = false;
    btnSubmit.innerText = "Guardar Libro";
    document.getElementById('modal-add-book').classList.add('hidden');
    document.getElementById('form-book').reset();
};

document.getElementById('btn-delete-book').onclick = async (e) => {
    e.stopPropagation();
    if (!currentInspectedBook) return;
    const bookId = currentInspectedBook.userData.id;

    await deleteBookFromDB(bookId);

    document.getElementById('book-info-card').classList.add('hidden');
    scene.remove(currentInspectedBook);
    currentInspectedBook = null;

    await renderBooks();
};

document.getElementById('btn-add-book').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('modal-add-book').classList.remove('hidden');
};

document.getElementById('btn-cancel').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('modal-add-book').classList.add('hidden');
};

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCameraFOV();
});

// Inicialización
(async () => {
    await initDB();
    initShelves();
    await renderBooks();
    animate();
})();
