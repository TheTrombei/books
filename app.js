// --- CONFIGURACIÓN DE ESCENA Y LUZ ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0807);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Iluminación
const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.65);
scene.add(ambientLight);

const mainLight = new THREE.SpotLight(0xffdfb3, 1.4);
mainLight.position.set(0, 14, 12);
mainLight.angle = Math.PI / 3;
mainLight.penumbra = 0.4;
mainLight.castShadow = true;
scene.add(mainLight);

// --- PARED DE FONDO Y MATERIALES MEJORADOS ---
// Textura Procedimental Madera
function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a2012';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 600; i++) {
        ctx.fillStyle = `rgba(20, 10, 5, ${Math.random() * 0.15})`;
        ctx.fillRect(Math.random() * 512, 0, Math.random() * 4 + 1, 512);
    }
    return new THREE.CanvasTexture(canvas);
}

const woodTexture = createWoodTexture();
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(1, 4);

const WOOD_MAT = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.45,
    metalness: 0.1,
    color: 0x52301a
});

// Pared del fondo
const wallGeo = new THREE.PlaneGeometry(35, 20);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x181310, roughness: 0.9 });
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(0, 5, -1.2);
scene.add(wallMesh);

// --- DATOS Y ESTANTERÍAS ---
let shelfNames = JSON.parse(localStorage.getItem('my_3d_shelf_names')) || ["Estantería Izquierda", "Estantería Central", "Estantería Derecha"];
let booksData = JSON.parse(localStorage.getItem('my_3d_books_v3')) || [];

const shelfGroups = [];
const bookMeshes = [];

let currentSelectedShelf = null;
let currentInspectedBook = null;
let isFlipped = false;

const defaultCamPos = { x: 0, y: 3.5, z: 12.5 };
camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

// --- CONSTRUCCIÓN DE MUEBLES ---
function createBookshelf(xPos, index) {
    const group = new THREE.Group();
    const width = 3.8, height = 5.4, depth = 0.85;

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

    // Repisas
    const shelfGeo = new THREE.BoxGeometry(width, 0.1, depth);
    const levelsY = [0.15, 1.45, 2.75, 4.05, 5.35];
    levelsY.forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, WOOD_MAT);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        shelf.castShadow = true;
        group.add(shelf);
    });

    group.position.set(xPos, 0, 0);
    group.userData = { id: index, targetX: xPos, targetY: 2.75 };
    scene.add(group);
    shelfGroups.push(group);
}

function initShelves() {
    createBookshelf(-4.4, 0);
    createBookshelf(0, 1);
    createBookshelf(4.4, 2);
    updateShelfDropdownOptions();
}

// --- RENDERIZADO DE LIBROS CON GROSOR DINÁMICO ---
function renderBooks() {
    bookMeshes.forEach(b => scene.remove(b));
    bookMeshes.length = 0;

    // Agrupar por estantería y nivel para acumular posiciones X reales
    const shelfTrackers = {};

    booksData.forEach((data, index) => {
        const sIdx = data.shelfIndex;
        const lIdx = data.levelIndex || 0;
        const key = `${sIdx}_${lIdx}`;

        if (!shelfTrackers[key]) shelfTrackers[key] = -1.6; // Inicio margen izquierdo del estante

        const spineThickness = data.spineThickness || 0.12; // Grosor dinámico calculado por el lomo
        const bookHeight = 0.95;
        const bookCoverWidth = 0.68;

        // BoxGeometry: X=Grosor Lomo, Y=Altura, Z=Ancho Portada
        const geometry = new THREE.BoxGeometry(spineThickness, bookHeight, bookCoverWidth);

        const textureLoader = new THREE.TextureLoader();
        const materials = [
            // Lomo (Cara frontal según nuestra orientación)
            data.spineImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.spineImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x222222 }), // Atrás
            new THREE.MeshStandardMaterial({ color: 0xeee8aa }), // Arriba (Hojas)
            new THREE.MeshStandardMaterial({ color: 0xeee8aa }), // Abajo
            // Portada
            data.coverImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.coverImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x111111 })  // Contraportada
        ];

        const bookMesh = new THREE.Mesh(geometry, materials);
        const shelfGroup = shelfGroups[sIdx];
        const levelY = [0.68, 1.98, 3.28, 4.58][lIdx];

        // Ubicación en el estante
        const currentX = shelfTrackers[key] + (spineThickness / 2);
        shelfTrackers[key] += spineThickness + 0.02; // Siguiente posición con pequeño espacio entre libros

        const worldX = shelfGroup.position.x + currentX;
        const worldY = levelY;
        const worldZ = 0.05;

        bookMesh.position.set(worldX, worldY, worldZ);
        bookMesh.rotation.y = Math.PI / 2; // Mostrar el lomo hacia el frente de la cámara
        bookMesh.castShadow = true;

        bookMesh.userData = { 
            ...data, 
            arrayIndex: index, 
            homePos: { x: worldX, y: worldY, z: worldZ },
            homeRot: { x: 0, y: Math.PI / 2, z: 0 }
        };

        scene.add(bookMesh);
        bookMeshes.push(bookMesh);
    });
}

// --- INTERACCIÓN Y CÁMARA (GSAP) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (e) => {
    if (e.target.closest('#ui-container') || e.target.closest('.modal') || e.target.closest('.card-info')) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 1. Clic en libro para tomarlo
    const bookHits = raycaster.intersectObjects(bookMeshes);
    if (bookHits.length > 0) {
        inspectBook(bookHits[0].object);
        return;
    }

    // 2. Clic en estantería para acercarse
    if (!currentSelectedShelf && !currentInspectedBook) {
        const shelfHits = raycaster.intersectObjects(shelfGroups.flatMap(g => g.children));
        if (shelfHits.length > 0) {
            let parent = shelfHits[0].object.parent;
            while (parent && !parent.userData.hasOwnProperty('targetX')) parent = parent.parent;
            if (parent) focusShelf(parent);
        }
    }
});

// Acercar Estantería
function focusShelf(shelfGroup) {
    currentSelectedShelf = shelfGroup;
    document.getElementById('btn-reset-cam').classList.remove('hidden');
    document.getElementById('btn-rename-shelf').classList.remove('hidden');
    document.getElementById('shelf-title-display').innerText = shelfNames[shelfGroup.userData.id];

    gsap.to(camera.position, {
        x: shelfGroup.userData.targetX,
        y: shelfGroup.userData.targetY,
        z: 4.8,
        duration: 1.4,
        ease: 'power2.inOut'
    });
}

// Volver a Vista General
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
        duration: 1.4,
        ease: 'power2.inOut'
    });
});

// --- ACCIÓN: TOMAR LIBRO Y VER EN GRANDE ---
function inspectBook(bookMesh) {
    if (currentInspectedBook) returnBookHome();
    currentInspectedBook = bookMesh;
    isFlipped = false;

    // Calcular punto frente a la cámara
    const targetPos = new THREE.Vector3();
    camera.getWorldDirection(targetPos);
    targetPos.multiplyScalar(2.2).add(camera.position);

    // Animación de tomar el libro y llevarlo al centro
    gsap.to(bookMesh.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 1,
        ease: 'back.out(1.2)'
    });

    gsap.to(bookMesh.rotation, {
        x: 0,
        y: camera.rotation.y + Math.PI / 2,
        z: 0,
        duration: 1
    });

    // Mostrar interfaz de inspección
    document.getElementById('card-title').innerText = bookMesh.userData.title;
    document.getElementById('card-author').innerText = `Autor: ${bookMesh.userData.author}`;
    document.getElementById('book-info-card').classList.remove('hidden');
}

// Girar Libro para ver Portada o Lomo
document.getElementById('btn-flip-book').addEventListener('click', () => {
    if (!currentInspectedBook) return;
    isFlipped = !isFlipped;
    const targetRotY = camera.rotation.y + (isFlipped ? 0 : Math.PI / 2);

    gsap.to(currentInspectedBook.rotation, {
        y: targetRotY,
        duration: 0.8,
        ease: 'power2.inOut'
    });
});

// Dejar Libro
function returnBookHome() {
    if (!currentInspectedBook) return;
    const home = currentInspectedBook.userData.homePos;
    const rot = currentInspectedBook.userData.homeRot;

    gsap.to(currentInspectedBook.position, { x: home.x, y: home.y, z: home.z, duration: 0.9, ease: 'power2.inOut' });
    gsap.to(currentInspectedBook.rotation, { x: rot.x, y: rot.y, z: rot.z, duration: 0.9 });

    currentInspectedBook = null;
    document.getElementById('book-info-card').classList.add('hidden');
}

document.getElementById('btn-close-inspect').addEventListener('click', returnBookHome);

// --- RENOMBRAR ESTANTERÍAS ---
document.getElementById('btn-rename-shelf').addEventListener('click', () => {
    if (!currentSelectedShelf) return;
    const sId = currentSelectedShelf.userData.id;
    const newName = prompt("Ingresa el nuevo nombre para esta estantería:", shelfNames[sId]);
    if (newName && newName.trim() !== "") {
        shelfNames[sId] = newName.trim();
        localStorage.setItem('my_3d_shelf_names', JSON.stringify(shelfNames));
        document.getElementById('shelf-title-display').innerText = shelfNames[sId];
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

// --- PROCESAMIENTO DE IMÁGENES Y GROSOR DEL LOMO ---
function processSpineImage(file) {
    return new Promise((resolve) => {
        if (!file) resolve({ base64: null, thickness: 0.12 });
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Relación de aspecto (Ancho / Alto)
                const aspect = img.width / img.height;
                // Escalar respecto a la altura estándar del libro (0.95)
                let calculatedThickness = 0.95 * aspect;
                // Límites razonables para evitar distorsiones excesivas
                calculatedThickness = Math.max(0.05, Math.min(0.35, calculatedThickness));
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

// Formulario Agregar Libro
document.getElementById('form-book').addEventListener('submit', async (e) => {
    e.preventDefault();

    const spineFile = document.getElementById('input-spine-file').files[0];
    const coverFile = document.getElementById('input-cover-file').files[0];

    const spineData = await processSpineImage(spineFile);
    const coverImg = await readFileAsBase64(coverFile);

    const newBook = {
        title: document.getElementById('input-title').value,
        author: document.getElementById('input-author').value,
        shelfIndex: parseInt(document.getElementById('select-shelf').value),
        levelIndex: parseInt(document.getElementById('select-level').value),
        spineImg: spineData.base64,
        spineThickness: spineData.thickness,
        coverImg: coverImg
    };

    booksData.push(newBook);
    localStorage.setItem('my_3d_books_v3', JSON.stringify(booksData));

    renderBooks();
    document.getElementById('modal-add-book').classList.add('hidden');
    document.getElementById('form-book').reset();
});

// Eliminar Libro
document.getElementById('btn-delete-book').addEventListener('click', () => {
    if (!currentInspectedBook) return;
    const idx = currentInspectedBook.userData.arrayIndex;
    booksData.splice(idx, 1);
    localStorage.setItem('my_3d_books_v3', JSON.stringify(booksData));
    document.getElementById('book-info-card').classList.add('hidden');
    currentInspectedBook = null;
    renderBooks();
});

// Modales UI
document.getElementById('btn-add-book').addEventListener('click', () => document.getElementById('modal-add-book').classList.remove('hidden'));
document.getElementById('btn-cancel').addEventListener('click', () => document.getElementById('modal-add-book').classList.add('hidden'));

// Bucle Render & Resize
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
