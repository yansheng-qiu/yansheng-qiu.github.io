// Andrey Ryabtsev
// This module class is matched to a DOM object, often a canvas. It supplies concise events for dragging and pinching/scrolling for cross platform input detection.
class RendererEventSidecar {
    // An event handler connected to a specific dom element. Then, .on(eventName, fn) registers callbacks for events: 'dragstart' (mousedown), 'dragmove', and 'dragend'
    constructor(dom) {
        this._dom = dom;
        this._handlers = {'dragend': [], 'dragmove': [], 'dragstart': [], 'pinch': []};
        this._dragData = {dragging: false};
        this._pinchData = {pinching: false};
        const self = this;
        function endDrag(e) {
            self._dragData.dragging = false;
            self.fireDragEvent('dragend', e);
        }
        function beginDrag(e) {
            const rect = dom.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            self._dragData = { dragging: true, x: mx, y: my};
            self.fireDragEvent('dragstart', e);
        }
        function moveDrag(e) {
            const rect = dom.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            if (self._dragData.dragging) {
                self._dragData.dx = mx - self._dragData.x;
                self._dragData.dy = my - self._dragData.y;
                self.fireDragEvent('dragmove', e);
                self._dragData.x = mx;
                self._dragData.y = my;
            }
        }
        function extractPinchData(e) {
            const touchPoints = [];
            for (let touch of e.touches) touchPoints.push(touch);
            // let clientX = touchPoints.reduce((s, ct) => s + ct.clientX, 0), clientY = touchPoints.reduce((s, ct) => s + ct.clientY, 0);
            let clientX = (touchPoints[0].clientX + touchPoints[1].clientX) / 2.0;
            let clientY = (touchPoints[0].clientY + touchPoints[1].clientY) / 2.0;
            let distance = Math.hypot(touchPoints[0].clientX - touchPoints[1].clientX, touchPoints[1].clientY - touchPoints[1].clientY);
            // const distances = touchPoints.map(ct => Math.hypot(ct.clientY - clientY, ct.clientX - clientX));
            // const meanDistance = distances.reduce((s, d) => s + d, 0) / distances.length;
            const rect = dom.getBoundingClientRect();
            return {centerX: clientX - rect.x, centerY: clientY - rect.y, meanDistance: distance};
        }
        dom.onmousedown = beginDrag;
        dom.onmousemove = moveDrag;
        dom.addEventListener('touchstart', e => {
            if (e.touches.length == 1) {
                const touch = e.changedTouches[0];
                beginDrag(touch);
            } else {
                self._dragData.dragging = false;
                self._pinchData = extractPinchData(e);
                self._pinchData.pinching = true;
            }
        });
        dom.addEventListener('touchmove', e => {
            if (e.changedTouches.length == 1) {
                const touch = e.changedTouches[0];
                moveDrag(touch);
            } else {
                if (self._pinchData.pinching) {
                    const newPinchData = extractPinchData(e);
                    const dDistance = newPinchData.meanDistance / self._pinchData.meanDistance;
                    const dx = newPinchData.centerX - self._pinchData.centerX, dy = newPinchData.centerY - self._pinchData.centerY;

                    self._fireEvent('pinch', {rawEvent:e, dDistance:dDistance, centerX: newPinchData.centerX, centerY: newPinchData.centerY, dx, dy});

                    self._pinchData = newPinchData;
                    self._pinchData.pinching = true;
                }
            }
        });
        dom.addEventListener('touchend', e => {
            if (e.touches.length == 0) {
                const touch = e.changedTouches[0];
                endDrag(touch);
            } else {
                if (e.touches.length == 1) {
                    self._pinchData.pinching = false;
                }
            }
        });
        dom.onmouseup = endDrag;
        dom.onmouseleave = endDrag;
    }
    on(eventName, fn) {
        console.assert(eventName in this._handlers, "Unrecognized drag event name '" + eventName + "'");
        this._handlers[eventName].push(fn);
    }
    fireDragEvent(eventName, rawEvent) {
        const dragEvent = {x: this._dragData.x, y: this._dragData.y, dx: this._dragData.dx, dy: this._dragData.dy, rawEvent: rawEvent};
        this._fireEvent(eventName, dragEvent);
    }
    _fireEvent(eventName, ...args) {
        for (let fn of this._handlers[eventName]) fn(...args);
    }
}
