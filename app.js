// --- ESCENA Y CÁMARA ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a120b);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffebd2, 0.85);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xfff5e6, 1.3);
spotLight.position.set(0, 16, 18);
spotLight.angle = Math.PI / 3;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
scene.add(spotLight);

// --- FONDO Y TEXTURA ---
function generateWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5c3216';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 450; i++) {
        ctx.fillStyle = `rgba(35, 15, 5, ${Math.random() * 0.25})`;
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
    roughness: 0.5,
    metalness: 0.05
});

const wallGeo = new THREE.PlaneGeometry(45, 25);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.9 });
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(0, 6, -1.5);
scene.add(wallMesh);

// --- ESTADO LOCAL ---
let shelfNames = JSON.parse(localStorage.getItem('my_3d_shelf_names_v5')) || ["Estantería 1", "Estantería 2", "Estantería 3"];
let booksData = JSON.parse(localStorage.getItem('my_3d_books_v5')) || [];

const shelfGroups = [];
const bookMeshes = [];
const labelMeshes = [];

let currentSelectedShelf = null;
let currentInspectedBook = null;
let isFlipped = false;

// Vista alejada ajustada para ver los 5 niveles completos
const defaultCamPos = { x: 0, y: 3.6, z: 15.5 };
camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

// --- CARTELES DE TEXTO 3D PARA NOMBRE DE ESTANTERÍA ---
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
    ctx.font = 'bold 38px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

// --- CONSTRUCCIÓN DE ESTANTERÍAS (5 NIVELES, ANCHO PARA 20 LIBROS) ---
function createBookshelf(xPos, index) {
    const group = new THREE.Group();
    const width = 5.6, height = 7.0, depth = 0.85;

    // Fondo Mueble
    const backGeo = new THREE.BoxGeometry(width, height, 0.08);
    const backMesh = new THREE.Mesh(backGeo, WOOD_MAT);
    backMesh.position.set(0, height / 2, -depth / 2);
    group.add(backMesh);

    // Laterales
    const sideGeo = new THREE.BoxGeometry(0.12, height, depth);
    const leftSide = new THREE.Mesh(sideGeo, WOOD_MAT);
    leftSide.position.set(-width / 2 + 0.06, height / 2, 0);
    const rightSide = new THREE.Mesh(sideGeo, WOOD_MAT);
    rightSide.position.set(width / 2 - 0.06, height / 2, 0);
    group.add(leftSide, rightSide);

    // 5 Repisas + Tapa Superior
    const shelfGeo = new THREE.BoxGeometry(width, 0.12, depth);
    const levelsY = [0.15, 1.45, 2.75, 4.05, 5.35, 6.65];
    levelsY.forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, WOOD_MAT);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        shelf.castShadow = true;
        group.add(shelf);
    });

    // Cartel con nombre arriba del mueble
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

// --- RENDERIZADO DE LIBROS EN LA ESCENA ---
function renderBooks() {
    // Limpiar todos los objetos previos de la escena limpiando adecuadamente la memoria
    bookMeshes.forEach(b => {
        scene.remove(b);
        if (b.geometry) b.geometry.dispose();
    });
    bookMeshes.length = 0;

    const shelfTrackers = {};

    // 5 niveles de Y
    const levelYArray = [0.72, 2.02, 3.32, 4.62, 5.92];

    booksData.forEach((data, index) => {
        const sIdx = data.shelfIndex;
        const lIdx = data.levelIndex || 0;
        const key = `${sIdx}_${lIdx}`;

        if (!shelfTrackers[key]) shelfTrackers[key] = -2.55; // Inicio X en estantería más ancha (ancho 5.6)

        // Grosor ajustado para caber hasta 20 libros por nivel
        const spineThickness = Math.min(data.spineThickness || 0.12, 0.22);
        const bookHeight = 1.0;
        const bookCoverWidth = 0.7;

        const geometry = new THREE.BoxGeometry(bookCoverWidth, bookHeight, spineThickness);
        const textureLoader = new THREE.TextureLoader();

        const materials = [
            data.coverImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.coverImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x222222 }),
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }),
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }),
            data.spineImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.spineImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
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
        bookMesh.castShadow = true;

        // Guardamos el id único del libro para evitar desfases al borrar
        bookMesh.userData = {
            ...data,
            id: data.id,
            homePos: { x: worldX, y: worldY, z: worldZ },
            homeRot: { x: 0, y: 0, z: 0 }
        };

        scene.add(bookMesh);
        bookMeshes.push(bookMesh);
    });
}

// --- INTERACCIÓN Y CÁMARA ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (e) => {
    if (e.target.closest('#ui-container') || e.target.closest('.modal') || e.target.closest('.card-info')) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

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
});

function focusShelf(shelfGroup) {
    currentSelectedShelf = shelfGroup;
    document.getElementById('btn-reset-cam').classList.remove('hidden');
    document.getElementById('btn-rename-shelf').classList.remove('hidden');
    document.getElementById('shelf-title-display').innerText = shelfNames[shelfGroup.userData.id];

    gsap.to(camera.position, {
        x: shelfGroup.userData.targetX,
        y: shelfGroup.userData.targetY,
        z: 5.6,
        duration: 1.3,
        ease: 'power2.inOut'
    });
}

document.getElementById('btn-reset-cam').addEventListener('click', () => {
    if (currentInspectedBook) returnBookHome();
    currentSelectedShelf = null;
    document.getElementById('btn-reset-cam').classList.add('hidden');
    document.getElementById('btn-rename-shelf').classList.add('hidden');
    document.getElementById('shelf-title-display').innerText = "Biblioteca Virtual 3D";

    gsap.to(camera.position, {
        x: defaultCamPos.x,
        y: defaultCamPos.y,
        z: defaultCamPos.z,
        duration: 1.3,
        ease: 'power2.inOut'
    });
});

// --- TOMAR LIBRO Y VER EN GRANDE ---
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

document.getElementById('btn-flip-book').addEventListener('click', () => {
    if (!currentInspectedBook) return;
    isFlipped = !isFlipped;
    const offset = isFlipped ? Math.PI / 2 : 0;

    gsap.to(currentInspectedBook.rotation, {
        y: camera.rotation.y + offset,
        duration: 0.7,
        ease: 'power2.inOut'
    });
});

function returnBookHome() {
    if (!currentInspectedBook) return;
    const home = currentInspectedBook.userData.homePos;
    const rot = currentInspectedBook.userData.homeRot;

    gsap.to(currentInspectedBook.position, { x: home.x, y: home.y, z: home.z, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(currentInspectedBook.rotation, { x: rot.x, y: rot.y, z: rot.z, duration: 0.8 });

    currentInspectedBook = null;
    document.getElementById('book-info-card').classList.add('hidden');
}

document.getElementById('btn-close-inspect').addEventListener('click', returnBookHome);

// --- RENOMBRAR ESTANTERÍA ---
document.getElementById('btn-rename-shelf').addEventListener('click', () => {
    if (!currentSelectedShelf) return;
    const sId = currentSelectedShelf.userData.id;
    const newName = prompt("Nuevo nombre para esta estantería:", shelfNames[sId]);
    if (newName && newName.trim() !== "") {
        shelfNames[sId] = newName.trim();
        localStorage.setItem('my_3d_shelf_names_v5', JSON.stringify(shelfNames));
        document.getElementById('shelf-title-display').innerText = shelfNames[sId];
        updateShelfLabels();
        updateShelfDropdownOptions();
    }
});

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

// --- PROCESAMIENTO DE IMÁGENES Y GUARDADO SEGURO ---
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

document.getElementById('form-book').addEventListener('submit', async (e) => {
    e.preventDefault();

    const spineFile = document.getElementById('input-spine-file').files[0];
    const coverFile = document.getElementById('input-cover-file').files[0];

    const spineData = await processSpineImage(spineFile);
    const coverImg = await readFileAsBase64(coverFile);

    const newBook = {
        id: Date.now() + Math.random(), // Identificador único
        title: document.getElementById('input-title').value,
        author: document.getElementById('input-author').value,
        shelfIndex: parseInt(document.getElementById('select-shelf').value),
        levelIndex: parseInt(document.getElementById('select-level').value),
        spineImg: spineData.base64,
        spineThickness: spineData.thickness,
        coverImg: coverImg
    };

    booksData.push(newBook);
    localStorage.setItem('my_3d_books_v5', JSON.stringify(booksData));

    renderBooks();
    document.getElementById('modal-add-book').classList.add('hidden');
    document.getElementById('form-book').reset();
});

// ELIMINADO SEGURO BASADO EN ID ÚNICO
document.getElementById('btn-delete-book').addEventListener('click', () => {
    if (!currentInspectedBook) return;
    const bookId = currentInspectedBook.userData.id;

    // Filtrar por ID en lugar de índice
    booksData = booksData.filter(b => b.id !== bookId);
    localStorage.setItem('my_3d_books_v5', JSON.stringify(booksData));

    document.getElementById('book-info-card').classList.add('hidden');
    scene.remove(currentInspectedBook);
    currentInspectedBook = null;

    renderBooks();
});

document.getElementById('btn-add-book').addEventListener('click', () => document.getElementById('modal-add-book').classList.remove('hidden'));
document.getElementById('btn-cancel').addEventListener('click', () => document.getElementById('modal-add-book').classList.add('hidden'));

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

initShelves();
renderBooks();
animate();
