// --- CONFIGURACIÓN DE ESCENA Y CÁMARA ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12100e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Iluminación Cálida Estilo Biblioteca
const ambientLight = new THREE.AmbientLight(0xffecd1, 0.7);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffd59e, 1.2);
spotLight.position.set(0, 12, 14);
spotLight.angle = Math.PI / 3;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
scene.add(spotLight);

// --- ESTADO Y VARIABLES DE CONTROL ---
let booksData = JSON.parse(localStorage.getItem('my_3d_books_v2')) || [];
const shelfGroups = [];
const bookMeshes = [];
let currentSelectedShelf = null;
let currentSelectedBook = null;

const defaultCamPos = { x: 0, y: 3.5, z: 12 };
const defaultCamTarget = { x: 0, y: 2.5, z: 0 };
camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

// --- CONSTRUCCIÓN DE ESTANTERÍAS MÚLTIPLES ---
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.6 });

function createBookshelf(xPos, index) {
    const group = new THREE.Group();
    const width = 3.6, height = 5.2, depth = 0.8;

    // Marco exterior
    const backGeo = new THREE.BoxGeometry(width, height, 0.1);
    const backMesh = new THREE.Mesh(backGeo, WOOD_MAT);
    backMesh.position.set(0, height / 2, -depth / 2);
    group.add(backMesh);

    // Repisas (4 Niveles)
    const shelfGeo = new THREE.BoxGeometry(width, 0.1, depth);
    const levelsY = [0.2, 1.4, 2.6, 3.8, 5.0];
    levelsY.forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, WOOD_MAT);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        group.add(shelf);
    });

    group.position.set(xPos, 0, 0);
    group.userData = { id: index, name: `Estantería ${index + 1}`, targetX: xPos, targetY: 2.6 };
    scene.add(group);
    shelfGroups.push(group);
}

function initShelves() {
    createBookshelf(-4.2, 0); // Izquierda
    createBookshelf(0, 1);    // Central
    createBookshelf(4.2, 2);  // Derecha
}

// --- CREACIÓN Y RENDERIZADO DE LIBROS 3D ---
function renderBooks() {
    // Limpiar libros anteriores de la escena
    bookMeshes.forEach(b => scene.remove(b));
    bookMeshes.length = 0;

    booksData.forEach((data, index) => {
        const shelfGroup = shelfGroups[data.shelfIndex];
        if (!shelfGroup) return;

        const bookWidth = 0.22;
        const bookHeight = 0.9;
        const bookDepth = 0.65;

        const geometry = new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth);

        // Texturas
        const textureLoader = new THREE.TextureLoader();
        const materials = [
            new THREE.MeshStandardMaterial({ color: 0x222222 }), // Derecha
            data.spineImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.spineImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }), // Lomo (Izquierda)
            new THREE.MeshStandardMaterial({ color: 0xdddddd }), // Arriba
            new THREE.MeshStandardMaterial({ color: 0xdddddd }), // Abajo
            data.coverImg ? new THREE.MeshStandardMaterial({ map: textureLoader.load(data.coverImg) }) : new THREE.MeshStandardMaterial({ color: 0x8b0000 }), // Portada (Frente)
            new THREE.MeshStandardMaterial({ color: 0x222222 })  // Atrás
        ];

        const bookMesh = new THREE.Mesh(geometry, materials);
        
        // Calcular posición dentro del estante especificado
        const levelY = [0.7, 1.9, 3.1, 4.3][data.levelIndex || 0];
        const offsetCount = bookMeshes.filter(b => b.userData.shelfIndex === data.shelfIndex && b.userData.levelIndex === data.levelIndex).length;
        const startX = -1.4 + (offsetCount * 0.26);

        bookMesh.position.set(shelfGroup.position.x + startX, levelY, 0.05);
        bookMesh.castShadow = true;

        bookMesh.userData = { ...data, arrayIndex: index, originalZ: 0.05 };
        scene.add(bookMesh);
        bookMeshes.push(bookMesh);
    });
}

// --- RAYCASTER (INTERACCIÓN CON CLIC) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (e) => {
    // Ignorar si clic viene de la interfaz UI
    if (e.target.closest('#ui-container') || e.target.closest('.modal') || e.target.closest('.card-info')) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 1. Clic en Libros
    const bookIntersects = raycaster.intersectObjects(bookMeshes);
    if (bookIntersects.length > 0) {
        const clickedBook = bookIntersects[0].object;
        selectBook(clickedBook);
        return;
    }

    // 2. Clic en Estanterías
    if (!currentSelectedShelf) {
        const shelfIntersects = raycaster.intersectObjects(shelfGroups.flatMap(g => g.children));
        if (shelfIntersects.length > 0) {
            let parent = shelfIntersects[0].object.parent;
            while (parent && !parent.userData.hasOwnProperty('targetX')) {
                parent = parent.parent;
            }
            if (parent) focusShelf(parent);
        }
    }
});

// --- ANIMACIONES DE CÁMARA (GSAP) ---
function focusShelf(shelfGroup) {
    currentSelectedShelf = shelfGroup;
    document.getElementById('btn-reset-cam').classList.remove('hidden');
    document.getElementById('shelf-title-display').innerText = shelfGroup.userData.name;

    gsap.to(camera.position, {
        x: shelfGroup.userData.targetX,
        y: shelfGroup.userData.targetY,
        z: 4.8,
        duration: 1.5,
        ease: 'power2.inOut'
    });
}

document.getElementById('btn-reset-cam').addEventListener('click', () => {
    currentSelectedShelf = null;
    deselectBook();
    document.getElementById('btn-reset-cam').classList.add('hidden');
    document.getElementById('shelf-title-display').innerText = "Biblioteca Virtual 3D";

    gsap.to(camera.position, {
        x: defaultCamPos.x,
        y: defaultCamPos.y,
        z: defaultCamPos.z,
        duration: 1.5,
        ease: 'power2.inOut'
    });
});

function selectBook(bookMesh) {
    deselectBook();
    currentSelectedBook = bookMesh;

    // Deslizar libro hacia adelante
    gsap.to(bookMesh.position, { z: bookMesh.userData.originalZ + 0.4, duration: 0.3 });

    // Mostrar Card con Info
    const card = document.getElementById('book-info-card');
    document.getElementById('card-title').innerText = bookMesh.userData.title;
    document.getElementById('card-author').innerText = `Autor: ${bookMesh.userData.author}`;
    card.classList.remove('hidden');
}

function deselectBook() {
    if (currentSelectedBook) {
        gsap.to(currentSelectedBook.position, { z: currentSelectedBook.userData.originalZ, duration: 0.3 });
        currentSelectedBook = null;
    }
    document.getElementById('book-info-card').classList.add('hidden');
}

// --- MANEJO DE IMÁGENES Y MODAL ---
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

    const coverFile = document.getElementById('input-cover-file').files[0];
    const spineFile = document.getElementById('input-spine-file').files[0];

    const coverImg = await readFileAsBase64(coverFile);
    const spineImg = await readFileAsBase64(spineFile);

    const newBook = {
        title: document.getElementById('input-title').value,
        author: document.getElementById('input-author').value,
        shelfIndex: parseInt(document.getElementById('select-shelf').value),
        levelIndex: parseInt(document.getElementById('select-level').value),
        coverImg: coverImg,
        spineImg: spineImg
    };

    booksData.push(newBook);
    localStorage.setItem('my_3d_books_v2', JSON.stringify(booksData));

    renderBooks();
    document.getElementById('modal-add-book').classList.add('hidden');
    document.getElementById('form-book').reset();
});

// Eliminar Libro
document.getElementById('btn-delete-book').addEventListener('click', () => {
    if (!currentSelectedBook) return;
    const index = currentSelectedBook.userData.arrayIndex;
    booksData.splice(index, 1);
    localStorage.setItem('my_3d_books_v2', JSON.stringify(booksData));
    deselectBook();
    renderBooks();
});

// Modal UI Control
document.getElementById('btn-add-book').addEventListener('click', () => document.getElementById('modal-add-book').classList.remove('hidden'));
document.getElementById('btn-cancel').addEventListener('click', () => document.getElementById('modal-add-book').classList.add('hidden'));

// Render Loop & Resize
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
