class GTAMap {
    constructor() {
        this.MAP_WIDTH = 4096;
        this.MAP_HEIGHT = 6144;
        this.TARGET_CELLS = 864;

        this.currentScale = 1;
        this.posX = 0;
        this.posY = 0;
        this.isDragging = false;
        this.hasMoved = false;
        this.startPos = { x: 0, y: 0 };
        this.selectedSectors = new Set();

        this.initElements();
        this.initMap();
        this.initEventListeners();
    }

    initElements() {
        this.mapViewport = document.getElementById('map-viewport');
        this.mapContainer = document.getElementById('map-container');
        this.gridOverlay = document.getElementById('grid-overlay');
        this.progressText = document.getElementById('progress-text');

        this.resetBtn = document.getElementById('reset-btn');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.resetZoomBtn = document.getElementById('reset-zoom');

        this.exportText = document.getElementById('export-text');
        this.importText = document.getElementById('import-text');
        this.copyExportBtn = document.getElementById('copy-export');
        this.importBtn = document.getElementById('import-btn');
    }

    initMap() {
        const aspectRatio = this.MAP_WIDTH / this.MAP_HEIGHT;
        this.cellsX = Math.round(Math.sqrt(this.TARGET_CELLS * aspectRatio));
        this.cellsY = Math.round(this.cellsX / aspectRatio);
        this.totalCells = this.cellsX * this.cellsY;
        this.cellWidth = this.MAP_WIDTH / this.cellsX;
        this.cellHeight = this.MAP_HEIGHT / this.cellsY;

        this.gridOverlay.style.gridTemplateColumns = `repeat(${this.cellsX}, ${this.cellWidth}px)`;
        this.gridOverlay.style.gridTemplateRows = `repeat(${this.cellsY}, ${this.cellHeight}px)`;
        this.gridOverlay.style.width = `${this.MAP_WIDTH}px`;
        this.gridOverlay.style.height = `${this.MAP_HEIGHT}px`;

        for (let y = 0; y < this.cellsY; y++) {
            for (let x = 0; x < this.cellsX; x++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                const sectorId = `${x},${y}`;
                cell.dataset.sector = sectorId;

                // Reset hasMoved on mousedown
                cell.addEventListener('mousedown', () => {
                    this.hasMoved = false;
                });

                // Only toggle sector if not dragging and no movement
                cell.addEventListener('click', (e) => {
                    if (!this.isDragging && !this.hasMoved) this.toggleSector(cell, sectorId);
                });

                this.gridOverlay.appendChild(cell);
            }
        }

        this.resetZoom();
    }

    initEventListeners() {
        this.resetBtn.addEventListener('click', () => this.resetSelection());
        this.zoomInBtn.addEventListener('click', () => this.zoom(1.2));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(0.8));
        this.resetZoomBtn.addEventListener('click', () => this.resetZoom());

        this.mapViewport.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        const hammer = new Hammer(this.mapViewport);
        hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
        hammer.on('panstart', (e) => this.startDrag(e));
        hammer.on('panmove', (e) => this.drag(e));
        hammer.on('panend', () => this.endDrag());

        this.mapViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
        }, { passive: false });

        window.addEventListener('resize', () => this.handleResize());

        document.getElementById('exportModal').addEventListener('show.bs.modal', () => this.exportSectors());
        this.copyExportBtn.addEventListener('click', () => this.copyExport());
        this.importBtn.addEventListener('click', () => this.importSectors());
    }

    toggleSector(cell, sectorId) {
        cell.classList.toggle('selected');
        if (cell.classList.contains('selected')) {
            this.selectedSectors.add(sectorId);
        } else {
            this.selectedSectors.delete(sectorId);
        }
        this.updateProgress();
    }

    updateProgress() {
        const percentage = Math.round((this.selectedSectors.size / this.totalCells) * 100);
        this.progressText.textContent = `${percentage}% completado (${this.selectedSectors.size}/${this.totalCells})`;
    }

    resetSelection() {
        document.querySelectorAll('.grid-cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
        this.selectedSectors.clear();
        this.updateProgress();
    }

    updateTransform() {
        this.mapContainer.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${this.currentScale})`;
    }

    resetZoom() {
        const viewportWidth = this.mapViewport.clientWidth;
        const viewportHeight = this.mapViewport.clientHeight;

        this.currentScale = Math.min(
            viewportWidth / this.MAP_WIDTH,
            viewportHeight / this.MAP_HEIGHT
        );

        this.posX = (viewportWidth - this.MAP_WIDTH * this.currentScale) / 2;
        this.posY = (viewportHeight - this.MAP_HEIGHT * this.currentScale) / 2;

        this.updateTransform();
        this.mapViewport.classList.remove('grabbing');
    }

    zoom(scaleFactor, clientX, clientY) {
        const oldScale = this.currentScale;
        this.currentScale = Math.max(0.1, Math.min(this.currentScale * scaleFactor, 5));

        if (clientX && clientY) {
            const rect = this.mapViewport.getBoundingClientRect();
            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;

            this.posX = mouseX - (mouseX - this.posX) * (this.currentScale / oldScale);
            this.posY = mouseY - (mouseY - this.posY) * (this.currentScale / oldScale);
        }

        this.constrainPosition();
        this.updateTransform();
    }

    constrainPosition() {
        const viewportWidth = this.mapViewport.clientWidth;
        const viewportHeight = this.mapViewport.clientHeight;
        const scaledWidth = this.MAP_WIDTH * this.currentScale;
        const scaledHeight = this.MAP_HEIGHT * this.currentScale;

        if (scaledWidth <= viewportWidth) {
            this.posX = (viewportWidth - scaledWidth) / 2;
        } else {
            this.posX = Math.min(0, Math.max(viewportWidth - scaledWidth, this.posX));
        }

        if (scaledHeight <= viewportHeight) {
            this.posY = (viewportHeight - scaledHeight) / 2;
        } else {
            this.posY = Math.min(0, Math.max(viewportHeight - scaledHeight, this.posY));
        }
    }

    startDrag(e) {
        const scaledWidth = this.MAP_WIDTH * this.currentScale;
        const scaledHeight = this.MAP_HEIGHT * this.currentScale;
        const viewportWidth = this.mapViewport.clientWidth;
        const viewportHeight = this.mapViewport.clientHeight;

        if (scaledWidth <= viewportWidth && scaledHeight <= viewportHeight) return;

        this.isDragging = true;
        this.hasMoved = false;
        const pos = e.center ? { x: e.center.x, y: e.center.y } : { x: e.clientX, y: e.clientY };
        this.startPos = {
            x: pos.x - this.posX,
            y: pos.y - this.posY
        };
        this.mapViewport.classList.add('grabbing');
        if (e.preventDefault) e.preventDefault();
    }

    drag(e) {
        if (!this.isDragging) return;

        const pos = e.center ? { x: e.center.x, y: e.center.y } : { x: e.clientX, y: e.clientY };
        const dx = pos.x - this.startPos.x - this.posX;
        const dy = pos.y - this.startPos.y - this.posY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.hasMoved = true;

        this.posX = pos.x - this.startPos.x;
        this.posY = pos.y - this.startPos.y;

        this.constrainPosition();
        this.updateTransform();
    }

    endDrag() {
        this.isDragging = false;
        this.mapViewport.classList.remove('grabbing');
    }

    handleResize() {
        if (this.currentScale <= 1) {
            this.resetZoom();
        } else {
            this.constrainPosition();
            this.updateTransform();
        }
    }

    exportSectors() {
        this.exportText.value = JSON.stringify(Array.from(this.selectedSectors));
    }

    copyExport() {
        this.exportText.select();
        document.execCommand('copy');
        this.showToast('Texto copiado al portapapeles', 'success');
    }

    importSectors() {
        try {
            const importedSectors = JSON.parse(this.importText.value);
            if (!Array.isArray(importedSectors)) throw new Error("Formato inválido");

            this.resetSelection();

            importedSectors.forEach(sectorId => {
                const cell = document.querySelector(`.grid-cell[data-sector="${sectorId}"]`);
                if (cell) {
                    cell.classList.add('selected');
                    this.selectedSectors.add(sectorId);
                }
            });

            this.updateProgress();
            bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
            this.showToast(`${importedSectors.length} sectores importados`, 'success');

        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'danger');
        }
    }

    showToast(message, type = 'info') {
        const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
        const toastElement = document.createElement('div');
        toastElement.className = `toast align-items-center text-white bg-${type}`;
        toastElement.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${icon} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        document.body.appendChild(toastElement);
        const toast = new bootstrap.Toast(toastElement);
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GTAMap();
});
