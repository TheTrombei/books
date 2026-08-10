// --- ESCENA Y CÁMARA ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x231810);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Iluminación cálida de ambiente y foco principal
const ambientLight = new THREE.AmbientLight(0xffebd2, 0.85);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xfff5e6, 1.2);
spotLight.position.set(0, 12, 14);
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

    // Base de madera cálida
    ctx.fillStyle = '#6e3c1b';
    ctx.fillRect(0, 0, 512, 512);

    // Vetas de madera
    for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(45, 20, 8, ${Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * 512, 0, Math.random() * 6 + 1, 512);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    tex.needsUpdate = true;
    return tex;
}

const WOOD_MAT = new THREE.MeshStandardMaterial({
    map: generateWoodTexture(),
    roughness: 0.5,
    metalness: 0.05
});

// Pared de fondo con tono cálido
const wallGeo = new THREE.PlaneGeometry(35, 20);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x362316, roughness: 0.9 });
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(0, 5, -1.2);
scene.add(wallMesh);

// --- ESTADO LOCAL Y REPOSITORIO DE DATOS ---
let shelfNames = JSON.parse(localStorage.getItem('my_3d_shelf_names_v4')) || ["Estantería 1", "Estantería 2", "Estantería 3"];
let booksData = JSON.parse(localStorage.getItem('my_3d_books_v4')) || [];

const shelfGroups = [];
const bookMeshes = [];

let currentSelectedShelf = null;
let currentInspectedBook = null;
let isFlipped = false;

const defaultCamPos = { x: 0, y: 3.2, z: 12.0 };
camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

// --- CONSTRUCCIÓN DE ESTANTERÍAS ---
function createBookshelf(xPos, index) {
    const group = new THREE.Group();
    const width = 3.8, height = 5.2, depth = 0.8;

    // Marco posterior
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

    // Repisas (4 Niveles)
    const shelfGeo = new THREE.BoxGeometry(width, 0.1, depth);
    const levelsY = [0.15, 1.4, 2.65, 3.9, 5.15];
    levelsY.forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, WOOD_MAT);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        shelf.castShadow = true;
        group.add(shelf);
    });

    group.position.set(xPos, 0, 0);
    group.userData = { id: index, targetX: xPos, targetY: 2.65 };
    scene.add(group);
    shelfGroups.push(group);
}

function initShelves() {
    createBookshelf(-4.4, 0);
    createBookshelf(0, 1);
    createBookshelf(4.4, 2);
    updateShelfDropdownOptions();
}

// --- RENDERIZADO DE LIBROS CON GROSOR CALCULADO Y POSICIONAMIENTO ---
function renderBooks() {
    bookMeshes.forEach(b => scene.remove(b));
    bookMeshes.length = 0;

    const shelfTrackers = {};

    booksData.forEach((data, index) => {
        const sIdx = data.shelfIndex;
        const lIdx = data.levelIndex || 0;
        const key = `${sIdx}_${lIdx}`;

        if (!shelfTrackers[key]) shelfTrackers[key] = -1.65; // Margen inicial en el estante

        const spineThickness = data.spineThickness || 0.12;
        const bookHeight = 0.95;
        const bookCoverWidth = 0.65;

        // BoxGeometry: X=Ancho Portada, Y=Altura, Z=Grosor Lomo
        const geometry = new THREE.BoxGeometry(bookCoverWidth, bookHeight, spineThickness);

        const textureLoader = new THREE.TextureLoader();
        const materials = [
            data.coverImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.coverImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }), // Portada
            new THREE.MeshStandardMaterial({ color: 0x222222 }), // Contraportada
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }), // Arriba (Hojas)
            new THREE.MeshStandardMaterial({ color: 0xfffdd0 }), // Abajo
            // Lomo (Alineado hacia el frente)
            data.spineImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.spineImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }),
            new THREE.MeshStandardMaterial({ color: 0x111111 })  // Lado posterior
        ];

        const bookMesh = new THREE.Mesh(geometry, materials);
        const shelfGroup = shelfGroups[sIdx];
        const levelY = [0.65, 1.9, 3.15, 4.4][lIdx];

        const currentX = shelfTrackers[key] + (spineThickness / 2);
        shelfTrackers[key] += spineThickness + 0.03; // Espaciado entre libros

        const worldX = shelfGroup.position.x + currentX;
        const worldY = levelY;
        const worldZ = 0.1;

        bookMesh.position.set(worldX, worldY, worldZ);
        bookMesh.castShadow = true;

        bookMesh.userData = {
            ...data,
            arrayIndex: index,
            homePos: { x: worldX, y: worldY, z: worldZ },
            homeRot: { x: 0, y: 0, z: 0 }
        };

        scene.add(bookMesh);
        bookMeshes.push(bookMesh);
    });
}

// --- INTERACCIÓN RAYCASTER Y CÁMARA ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (e) => {
    if (e.target.closest('#ui-container') || e.target.closest('.modal') || e.target.closest('.card-info')) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 1. Clic en Libro
    const bookHits = raycaster.intersectObjects(bookMeshes);
    if (bookHits.length > 0) {
        inspectBook(bookHits[0].object);
        return;
    }

    // 2. Clic en Estantería
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
        z: 4.6,
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

// --- CENTRADO EXACTO DEL LIBRO AL TOMARLO ---
function inspectBook(bookMesh) {
    if (currentInspectedBook) returnBookHome();
    currentInspectedBook = bookMesh;
    isFlipped = false;

    // Posicionamiento 3D exactamente al centro frente a la cámara actual
    const targetVector = new THREE.Vector3(0, 0, -2.0); // 2 unidades por delante
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

// --- RENOMBRAR ESTANTERÍAS ---
document.getElementById('btn-rename-shelf').addEventListener('click', () => {
    if (!currentSelectedShelf) return;
    const sId = currentSelectedShelf.userData.id;
    const newName = prompt("Nombre de la estantería:", shelfNames[sId]);
    if (newName && newName.trim() !== "") {
        shelfNames[sId] = newName.trim();
        localStorage.setItem('my_3d_shelf_names_v4', JSON.stringify(shelfNames));
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

// --- PROCESAMIENTO ASÍNCRONO DE IMAGEN Y CÁLCULO DE GROSOR DEL LOMO ---
function processSpineImage(file) {
    return new Promise((resolve) => {
        if (!file) resolve({ base64: null, thickness: 0.12 });
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const aspect = img.width / img.height;
                let calculatedThickness = 0.95 * aspect;
                calculatedThickness = Math.max(0.06, Math.min(0.30, calculatedThickness));
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
        title: document.getElementById('input-title').value,
        author: document.getElementById('input-author').value,
        shelfIndex: parseInt(document.getElementById('select-shelf').value),
        levelIndex: parseInt(document.getElementById('select-level').value),
        spineImg: spineData.base64,
        spineThickness: spineData.thickness,
        coverImg: coverImg
    };

    booksData.push(newBook);
    localStorage.setItem('my_3d_books_v4', JSON.stringify(booksData));

    renderBooks();
    document.getElementById('modal-add-book').classList.add('hidden');
    document.getElementById('form-book').reset();
});

document.getElementById('btn-delete-book').addEventListener('click', () => {
    if (!currentInspectedBook) return;
    const idx = currentInspectedBook.userData.arrayIndex;
    booksData.splice(idx, 1);
    localStorage.setItem('my_3d_books_v4', JSON.stringify(booksData));
    document.getElementById('book-info-card').classList.add('hidden');
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
