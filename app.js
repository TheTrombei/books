// Configuración Inicial de Three.js
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c23);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 15);
dirLight.castShadow = true;
scene.add(dirLight);

// Datos y Estado
let booksData = JSON.parse(localStorage.getItem('my_3d_books')) || [];
const shelves = [];
const bookMeshes = [];

// Posiciones iniciales de Cámara
const defaultCamPos = { x: 0, y: 3, z: 12 };
camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

// Crear 3 Estanterías
function createShelves() {
    const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
    
    for (let i = 0; i < 3; i++) {
        const shelfGroup = new THREE.Group();
        const xPos = (i - 1) * 4.5;

        // Estructura vertical básica
        const geometry = new THREE.BoxGeometry(3.5, 5, 0.8);
        const mesh = new THREE.Mesh(geometry, shelfMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        shelfGroup.add(mesh);

        shelfGroup.position.set(xPos, 2, 0);
        shelfGroup.userData = { id: i, name: `Estantería ${i + 1}` };
        
        scene.add(shelfGroup);
        shelves.push(shelfGroup);
    }
}

// Bucle de Renderizado
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Resize Responsive
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inicialización
createShelves();
animate();

// Interacción UI Modal
const modal = document.getElementById('modal-add-book');
document.getElementById('btn-add-book').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.add('hidden'));
