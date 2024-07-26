// Andrey Ryabtsev
// This file contains ResponsiveCanvasGroup, a wrapper around several canvases that display synchronized large images
// A ResponsiveCanvasGroup manages several canvases which are squares of side length .uiSize
// Dragging and scrolling to pan and zoom in one canvas will show in the others
// This allows comparing particular areas of the input image and the results at different scales.

// Accepts an image or a canvas. Returns a canvas of the image, rotated 'clockwise' or 'counterclockwise'
function rotateImage90(image, direction='clockwise') {
    const canvas = document.createElement('canvas');
    canvas.width = image.height;
    canvas.height = image.width;
    const g = canvas.getContext('2d');
    g.translate(direction === 'clockwise' ? image.height : 0, direction === 'counterclockwise' ? image.width : 0);
    g.rotate((direction === 'clockwise' ? 1 : -1) * Math.PI / 2);
    g.drawImage(image, 0, 0);
    return canvas;
}

class ResponsiveCanvasGroup {
    // a group stores image data for any number of names, and possibly an 'A' and 'B' `version` for each name
    constructor(uiSize=200) {
        this.uiSize = uiSize;
        this.zoomRate = 1.001;
        this.versionMode = 'a';
        this.state = {
            magnification: 1.0,
            x: 0.0,
            y: 0.0
        };
        this.dragData = {
            dragging: false
        };
        this.eventSidecars = {};
        this.canvasses = {};
        this.imageData = {};
        this.zoomDiv = undefined;
        this.posDiv = undefined;
    }

    // Open a download dialog window and initiate a download of the image under `name`. Uses `A` image if in `A` or `A|B` mode, `B` image otherwise
    download(name) {
        const dlVersion = this.versionMode === 'b' ? 'b' : 'a';
        const suffix = 'a' in this.imageData[name] && 'b' in this.imageData[name] ? dlVersion.toUpperCase() : "";
        const virtualLink = document.createElement('a');
        virtualLink.download = name + suffix + '.png';
        virtualLink.href = this.getFullImageBase64(name, dlVersion);
        virtualLink.click();
    }

    // Get the base64-encoded image data for a particular `name` and `version`
    getFullImageBase64(name, version) {
        if (!(name in this.imageData) || !(version in this.imageData[name] || 'both' in this.imageData[name])) return null;
        const image = this.imageData[name][version] || this.imageData[name]['both'];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL();
    }

    // Sets the image for a particular `name` and `version` to `image`.
    // Optionally displays it immediately and, if so, optionally sets group magnification to fit the new image.
    setImage(name, version, image, displayImmediately=false, updateMagnification=false) {
        if (!(name in this.imageData)) this.imageData[name] = {};
        this.imageData[name][version] = image;
        if (displayImmediately) this.renderImage(name, updateMagnification=updateMagnification);
    }

    // Sets the image for a particular `name` and `version` to `encoded_image` after decoding.
    // Optionally displays it ASAP and, if so, optionally sets group magnification to fit the new image.
    setImageBase64(name, version, encoded_image, displayImmediately=false, updateMagnification=false) {
        if (encoded_image.indexOf(",") === -1) encoded_image = "data:image/png;base64," + encoded_image;
        const image = new Image();
        image.onload = () => {
            this.setImage(name, version, image, displayImmediately, updateMagnification);
        };
        image.src = encoded_image;
    }

    // Change the displayed mode to 'a', 'b', or 'both'.
    // The latter view is split down the middle vertically with A on the left and B on the right.
    changeVersionMode(mode) {
        this.versionMode = mode;
        this.renderAll();
    }

    // Actually display an image for `name`. Optionally update the group's magnification/offset to center and fit the image
    renderImage(name, updateMagnification=false) {
        const g = this.canvasses[name].getContext("2d"), image = this.imageData[name]['a'] || this.imageData[name]['both'];
        const hx = this.uiSize, hy = this.uiSize;
        if (updateMagnification) {
            this.state.magnification = Math.min((hx * 2) / image.width, (hy * 2) / image.height);
            this.state.x = this.state.y = 0;
            if (this.zoomDiv) this.zoomDiv.innerHTML = Math.floor(this.state.magnification * 100) + "%";
        }
        g.canvas.width = 2 * hx;
        g.canvas.height = 2 * hy;
        const sx = Math.floor(image.width / 2) + this.state.x, sy = Math.floor(image.height / 2) + this.state.y;
        const sw = Math.floor(hx / this.state.magnification), sh = Math.floor(hy / this.state.magnification);
        if (this.versionMode === 'both' && 'a' in this.imageData[name] && 'b' in this.imageData[name]) {
            g.drawImage(image, sx - sw, sy - sh, sw, 2 * sh, 0, 0, hx, 2 * hy);
            g.drawImage(this.imageData[name]['b'], sx, sy - sh, sw, 2 * sh, hx, 0, hx, 2 * hy);
            g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx, 2 * hy); g.stroke();
        } else {
            const showVersion = this.versionMode === 'both' ? 'a' : this.versionMode;
            const image = this.imageData[name][showVersion] || this.imageData[name]['both'];
            g.drawImage(image, sx - sw, sy - sh, 2 * sw, 2 * sh, 0, 0, 2 * hx, 2 * hy);
        }
    }

    // Update the display on each canvas
    renderAll(updateMagnification=false) {
        Object.keys(this.imageData).forEach(imageName => {
            this.renderImage(imageName, updateMagnification);
        });
    }

    // Add the `canvas` to the group, tracking its mouse data and displaying `name` data to it
    registerCanvas(name, canvas) {
        const self = this;
        self.canvasses[name] = canvas;
        self.eventSidecars[name] = new RendererEventSidecar(canvas);

        canvas.width = 2 * this.uiSize;
        canvas.height = 2 * this.uiSize;

        function zoomBy(zf, x, y) {
            self.state.magnification *= zf;
            if (self.zoomDiv) self.zoomDiv.innerHTML = Math.floor(self.state.magnification * 100) + "%";

            
            const relativeX = x / self.state.magnification;
            const relativeY = y / self.state.magnification;
            self.state.x += (1 - 1.0 / zf) * relativeX;
            self.state.y += (1 - 1.0 / zf) * relativeY;
            self.renderAll();
        }

        self.eventSidecars[name].on('pinch', e => {
            const cx = Math.floor(canvas.clientWidth / 2), cy = Math.floor(canvas.clientHeight / 2);
            self.state.x -= e.dx / self.state.magnification;
            self.state.y -= e.dy / self.state.magnification;
            console.log(e.dDistance);
            zoomBy(e.dDistance, e.centerX - cx, e.centerY - cy);
        });
        canvas.onwheel = e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect(), cx = Math.floor(canvas.clientWidth / 2), cy = Math.floor(canvas.clientHeight / 2);
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const scrolled = Math.pow(self.zoomRate, -e.deltaY);
            zoomBy(scrolled, mx - cx, my - cy);
        };

        self.eventSidecars[name].on('dragmove', e => {
            const factor = -1.0 / self.state.magnification;
            self.state.x += e.dx * factor;
            self.state.y += e.dy * factor;
            self.renderAll();
        });
        // self.eventSidecars[name].on('dragstart', e => {});
        // self.eventSidecars[name].on('dragend', e => {});
    }
    
    // Update the data for `name` to be a version of the current image rotated 90 degrees according to `direction`.
    // Optionally display ASAP. By default, update data for all versions for each data exists, specify `version` to rotate only one.
    rotateImage(name, direction='clockwise', displayImmediately=false, version='both') {
        if (version == 'both') {
            Object.keys(this.imageData[name]).forEach(imageVersion => {
                this.imageData[name][imageVersion] = rotateImage90(this.imageData[name][imageVersion], direction);
            });
        } else {
            this.imageData[name][version] = rotateImage90(this.imageData[name][version], direction);
        }
        if (displayImmediately) this.renderImage(name);
    }
}