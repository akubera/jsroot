/// @file JSRoot3DPainter.js
/// JavaScript ROOT 3D graphics

(function( factory ) {
   if ( typeof define === "function" && define.amd ) {
      // AMD. Register as an anonymous module.
      define( ['d3', 'JSRootPainter', 'threejs_all'], factory );
   } else {

      if (typeof JSROOT == 'undefined')
         throw new Error('JSROOT is not defined', 'JSRoot3DPainter.js');

      if (typeof d3 != 'object')
         throw new Error('This extension requires d3.v3.js', 'JSRoot3DPainter.js');

      if (typeof JSROOT.Painter != 'object')
         throw new Error('JSROOT.Painter is not defined', 'JSRoot3DPainter.js');

      if (typeof THREE == 'undefined')
         throw new Error('THREE is not defined', 'JSRoot3DPainter.js');

      factory(d3, JSROOT);
   }
} (function(d3, JSROOT) {

   JSROOT.Painter.TestWebGL = function() {
      // return true if WebGL should be used
      /**
       * @author alteredq / http://alteredqualia.com/
       * @author mr.doob / http://mrdoob.com/
       */

      if (JSROOT.gStyle.NoWebGL) return false;

      if ('_Detect_WebGL' in this) return this._Detect_WebGL;

      try {
         var canvas = document.createElement( 'canvas' );
         this._Detect_WebGL = !! ( window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ) );
         //res = !!window.WebGLRenderingContext &&  !!document.createElement('canvas').getContext('experimental-webgl');
       } catch (e) {
           return false;
       }

       return this._Detect_WebGL;
   }

   JSROOT.Painter.TooltipFor3D = function(prnt, canvas) {
      this.tt = null;
      this.cont = null;
      this.lastlbl = '';
      this.parent = prnt ? prnt : document.body;
      this.canvas = canvas; // we need canvas to recalculate mouse events
      this.abspos = !prnt;

      this.pos = function(e) {
         // method used to define position of next tooltip
         // event is delivered from canvas,
         // but position should be calculated relative to the element where tooltip is placed

         if (this.tt === null) return;
         var u,l;
         if (this.abspos) {
            l = JSROOT.browser.isIE ? (e.clientX + document.documentElement.scrollLeft) : e.pageX;
            u = JSROOT.browser.isIE ? (e.clientY + document.documentElement.scrollTop) : e.pageY;
         } else {

            l = e.offsetX;
            u = e.offsetY;

            var rect1 = this.parent.getBoundingClientRect(),
                rect2 = this.canvas.getBoundingClientRect();

            if ((rect1.left !== undefined) && (rect2.left!== undefined)) l += (rect2.left-rect1.left);

            if ((rect1.top !== undefined) && (rect2.top!== undefined)) u += rect2.top-rect1.top;

            if (l + this.tt.offsetWidth + 3 >= this.parent.offsetWidth)
               l = this.parent.offsetWidth - this.tt.offsetWidth - 3;

            if (u + this.tt.offsetHeight + 15 >= this.parent.offsetHeight)
               u = this.parent.offsetHeight - this.tt.offsetHeight - 15;

            // one should find parent with non-static position,
            // all absolute coordinates calculated relative to such node
            var abs_parent = this.parent;
            while (abs_parent) {
               // console.log(abs_parent.nodeType, abs_parent.id);
               var style = getComputedStyle(abs_parent);
               if (!style || (style.position !== 'static')) break;
               if (!abs_parent.parentNode || (abs_parent.parentNode.nodeType != 1)) break;
               abs_parent = abs_parent.parentNode;
            }

            if (abs_parent && (abs_parent !== this.parent)) {
               var rect0 = abs_parent.getBoundingClientRect();
               l+=(rect1.left - rect0.left);
               u+=(rect1.top - rect0.top);
            }

         }

         this.tt.style.top = (u + 15) + 'px';
         this.tt.style.left = (l + 3) + 'px';
      };

      this.show  = function(v) {
         if (JSROOT.gStyle.Tooltip <= 0) return;
         if (!v || (v==="")) return this.hide();
         if (typeof v !='string' && v.length) {
            var res = v[0];
            for (var n=1;n<v.length;++n) res+= "<br/>" + v[n];
            v = res;
         }

         if (this.tt === null) {
            this.tt = document.createElement('div');
            this.tt.setAttribute('class', 'jsroot');
            var t = document.createElement('div');
            t.setAttribute('class', 'tt3d_border');
            this.cont = document.createElement('div');
            this.cont.setAttribute('class', 'tt3d_cont');
            var b = document.createElement('div');
            b.setAttribute('class', 'tt3d_border');
            this.tt.appendChild(t);
            this.tt.appendChild(this.cont);
            this.tt.appendChild(b);
            this.tt.style.opacity = 1;
            this.tt.style.filter = 'alpha(opacity=1)';
            this.tt.style.position = 'absolute';
            this.tt.style.display = 'block';
            this.tt.style.overflow = 'hidden';
            this.parent.appendChild(this.tt);
         }

         if (this.lastlbl !== v) {
            this.cont.innerHTML = v;
            this.lastlbl = v;
            this.tt.style.width = 'auto'; // let it be automatically resizing...
            if (JSROOT.browser.isIE)
               this.tt.style.width = this.tt.offsetWidth;
         }
      };

      this.hide  = function() {
         if (this.tt !== null)
            this.parent.removeChild(this.tt);

         this.tt = null;
         this.lastlbl = "";
      }

      return this;
   }


   JSROOT.Painter.CreateOrbitControl = function(painter, camera, scene, renderer, lookat) {

      renderer.domElement.addEventListener( 'mousewheel', control_mousewheel);
      renderer.domElement.addEventListener( 'MozMousePixelScroll', control_mousewheel);
      renderer.domElement.addEventListener( 'mousedown', control_mousedown);
      renderer.domElement.addEventListener( 'mouseup', control_mouseup);

      var control = new THREE.OrbitControls(camera, renderer.domElement);

      control.enableDamping = false;
      control.dampingFactor = 1.0;
      control.enableZoom = true;
      if (lookat) {
         control.target.copy(lookat);
         control.target0.copy(lookat);
         control.update();
      }

      var mouse_ctxt = { x:0, y: 0, on: false },
          raycaster = new THREE.Raycaster(),
          webgl = renderer instanceof THREE.WebGLRenderer,
          control_active = false, control_changed = false, cursor_changed = false,
          mouse_zoom_mesh = null, // zoom mesh, currently used in the zooming
          block_ctxt = false, // require to block context menu command appearing after control ends, required in chrome which inject contextmenu when key released
          tooltip = new JSROOT.Painter.TooltipFor3D(painter.select_main().node(), renderer.domElement);

      control.ProcessMouseDblclick = function(evnt) {
         var intersect = DetectZoomMesh(evnt);
         if (intersect && painter) {
            painter.Unzoom(intersect.object.zoom);
         } else {
            control.reset();
         }
         // painter.Render3D();
      }

      control.HideTooltip = function() {
         tooltip.hide();
      }

      function GetMousePos(evnt, mouse) {
         mouse.x = ('offsetX' in evnt) ? evnt.offsetX : evnt.layerX;
         mouse.y = ('offsetY' in evnt) ? evnt.offsetY : evnt.layerY;
         mouse.clientX = evnt.clientX;
         mouse.clientY = evnt.clientY;
         return mouse;
      }

      function GetIntersects(mouse) {
         // domElement gives correct coordinate with canvas render, but isn't always right for webgl renderer
         var sz = webgl ? renderer.getSize() : renderer.domElement;
         var pnt = { x: mouse.x / sz.width * 2 - 1, y: -mouse.y / sz.height * 2 + 1 };

         camera.updateMatrix();
         camera.updateMatrixWorld();
         raycaster.setFromCamera( pnt, camera );
         var intersects = raycaster.intersectObjects(scene.children, true);

         // painter may want to filter intersects
         if (typeof painter.FilterIntersects == 'function')
            intersects = painter.FilterIntersects(intersects);

         return intersects;
      }

      control.addEventListener( 'change', function() {
         mouse_ctxt.on = false; // disable context menu if any changes where done by orbit control
         painter.Render3D(0);
         control_changed = true;
      });

      control.addEventListener( 'start', function() {
         control_active = true;
         block_ctxt = false;
         mouse_ctxt.on = false;

         tooltip.hide();

         // do not reset here, problem of events sequence in orbitcontrol
         // it issue change/start/stop event when do zooming
         // control_changed = false;
      });

      control.addEventListener( 'end', function() {
         control_active = false;
         if (mouse_ctxt.on) {
            mouse_ctxt.on = false;
            control.ContextMenu(mouse_ctxt, GetIntersects(mouse_ctxt));
            // painter.OrbitContext(mouse_ctxt, GetIntersects(mouse_ctxt));
         } else
         if (control_changed) {
            // react on camera change when required
         }
         control_changed = false;
      });

      function control_contextmenu(evnt) {
         evnt.preventDefault();
         GetMousePos(evnt, mouse_ctxt);
         if (control_active)
            mouse_ctxt.on = true;
         else
         if (block_ctxt)
            block_ctxt = false;
         else
            control.ContextMenu(mouse_ctxt, GetIntersects(mouse_ctxt));

            // console.log('call context menu');
            // painter.OrbitContext(mouse_ctxt, GetIntersects(mouse_ctxt));
      };

      function control_touchstart(evnt) {
         if (!evnt.touches) return;

      // disable context menu if any changes where done by orbit control
         if (!control_changed && !mouse_ctxt.touchtm) {
            GetMousePos(evnt.touches[0], mouse_ctxt);
            mouse_ctxt.touchtm = new Date().getTime();
         }
      };

      function control_touchend(evnt) {
         if (!evnt.touches) return;

         if (control_changed || !mouse_ctxt.touchtm) return;

         var diff = new Date().getTime() - mouse_ctxt.touchtm;
         delete mouse_ctxt.touchtm;
         if (diff < 200) return;

         var pos = GetMousePos(evnt.touches[0], {});

         if ((Math.abs(pos.x - mouse_ctxt.x) <= 10) && (Math.abs(pos.y - mouse_ctxt.y) <= 10))
            control.ContextMenu(mouse_ctxt, GetIntersects(mouse_ctxt));
      };

      control.ContextMenu = function(pos, intersects) {
         // do nothing, function called when context menu want to be activated
      }


      function control_mousemove(evnt) {
         if (control_active && evnt.buttons && (evnt.buttons & 2)) {
            block_ctxt = true; // if right button in control was active, block next context menu
         }

         if (control_active || !control.ProcessMouseMove) return;

         if (mouse_zoom_mesh) {
            // when working with zoom mesh, need special handling

            var zoom2 = DetectZoomMesh(evnt), pnt2 = null;

            if (zoom2 && (zoom2.object === mouse_zoom_mesh.object)) {
               pnt2 = zoom2.point;
            } else {
               pnt2 = mouse_zoom_mesh.object.GlobalIntersect(raycaster);
            }

            if (pnt2) mouse_zoom_mesh.point2 = pnt2;

            if (pnt2 && painter.enable_hightlight)
               if (mouse_zoom_mesh.object.ShowSelection(mouse_zoom_mesh.point, pnt2))
                  painter.Render3D(0);

            tooltip.hide();
            return;
         }

         var mouse = GetMousePos(evnt, {});
         evnt.preventDefault();

         var intersects = GetIntersects(mouse);

         var info = control.ProcessMouseMove(intersects);

         cursor_changed = false;
         if (info && (info.length>0)) {
            tooltip.show(info, 200);
            tooltip.pos(evnt)
         } else {
            tooltip.hide();
            if (intersects)
               for (var n=0;n<intersects.length;++n)
                  if (intersects[n].object.zoom) cursor_changed = true;
         }

         document.body.style.cursor = cursor_changed ? 'pointer' : 'auto';
      };

      function control_mouseleave() {
         tooltip.hide();
         if (control.ProcessMouseLeave) control.ProcessMouseLeave();
         if (cursor_changed) {
            document.body.style.cursor = 'auto';
            cursor_changed = false;
         }
      };

      function DetectZoomMesh(evnt) {
         var mouse = GetMousePos(evnt, {});
         var intersects = GetIntersects(mouse);
         if (intersects)
            for (var n=0;n<intersects.length;++n)
               if (intersects[n].object.zoom)
                  return intersects[n];

         return null;
      }

      function control_mousewheel(evnt) {
         // try to handle zoom extra

         if (JSROOT.Painter.IsRender3DFired(painter) || mouse_zoom_mesh) {
            evnt.preventDefault();
            evnt.stopPropagation();
            evnt.stopImmediatePropagation();
            return; // already fired redraw, do not react on the mouse wheel
         }

         var intersect = DetectZoomMesh(evnt);
         if (!intersect) return;

         evnt.preventDefault();
         evnt.stopPropagation();
         evnt.stopImmediatePropagation();

         if (painter && (painter.AnalyzeMouseWheelEvent!==undefined)) {
            var kind = intersect.object.zoom,
                position = intersect.point[kind],
                item = { name: kind, ignore: false };

            // z changes from 0..2*size3d, others -size3d..+size3d
            if (kind!=="z") position += painter.size3d;

            painter.AnalyzeMouseWheelEvent(evnt, item, position/2/painter.size3d, false);

            painter.Zoom(kind, item.min, item.max);
         }
      }

      function control_mousedown(evnt) {
         // function used to hide some events from orbit control and redirect them to zooming rect

         if (mouse_zoom_mesh) {
            evnt.stopImmediatePropagation();
            evnt.stopPropagation();
            return;
         }

         // only left-button is considered
         if ((evnt.button!==undefined) && (evnt.button !==0)) return;
         if ((evnt.buttons!==undefined) && (evnt.buttons !== 1)) return;

         mouse_zoom_mesh = DetectZoomMesh(evnt);
         if (!mouse_zoom_mesh) return;


         // just block orbit control
         evnt.stopImmediatePropagation();
         evnt.stopPropagation();
      }

      function control_mouseup(evnt) {
         if (mouse_zoom_mesh && mouse_zoom_mesh.point2) {

            var kind = mouse_zoom_mesh.object.zoom,
                pos1 = mouse_zoom_mesh.point[kind],
                pos2 = mouse_zoom_mesh.point2[kind];

            if (kind!=="z") { pos1+=painter.size3d; pos2+=painter.size3d; }

            // we recalculate positions ourself,
            // in the future one should use CreateXY in 3D painters

            pos1 = pos1/2/painter.size3d; pos2 = pos2/2/painter.size3d;

            if (pos1>pos2) { var v = pos1; pos1 = pos2; pos2 = v; }

            var min = painter['scale_'+kind+"min"], max = painter['scale_'+kind+"max"];

            if (painter["log"+kind]) {
               pos1 = Math.exp(Math.log(min) + pos1*(Math.log(max)-Math.log(min)));
               pos2 = Math.exp(Math.log(min) + pos2*(Math.log(max)-Math.log(min)));
            } else {
               pos1 = min + pos1*(max-min);
               pos2 = min + pos2*(max-min);
            }

            // try to zoom
            if (pos1 < pos2)
              if (painter.Zoom(kind, pos1, pos2))
                 mouse_zoom_mesh = null;
         }

         // if selection was drawn, it should be removed and picture rendered again
         if (mouse_zoom_mesh && mouse_zoom_mesh.object.ShowSelection())
            painter.Render3D();

         mouse_zoom_mesh = null; // in any case clear mesh, enable orbit control again
      }


      function control_mousedblclick(evnt) {
         control.ProcessMouseDblclick(evnt);
      }

      renderer.domElement.addEventListener( 'dblclick', control_mousedblclick);

      renderer.domElement.addEventListener('contextmenu', control_contextmenu);
      renderer.domElement.addEventListener('mousemove', control_mousemove);
      renderer.domElement.addEventListener('mouseleave', control_mouseleave);

      // do not use touch events, context menu should be activated via button
      //painter.renderer.domElement.addEventListener('touchstart', control_touchstart);
      //painter.renderer.domElement.addEventListener('touchend', control_touchend);


      return control;
   }

   JSROOT.Painter.DisposeThreejsObject = function(obj) {
      if (!obj) return;

      if (obj.children) {
         for (var i = 0; i < obj.children.length; i++)
            JSROOT.Painter.DisposeThreejsObject(obj.children[i]);
         obj.children = undefined;
      }
      if (obj.geometry) {
         obj.geometry.dispose();
         obj.geometry = undefined;
      }
      if (obj.material) {
         if (obj.material.map) {
            obj.material.map.dispose();
            obj.material.map = undefined;
         }
         obj.material.dispose();
         obj.material = undefined;
      }

      // cleanup jsroot fields to simplify browser cleanup job
      delete obj.painter;
      delete obj.bins_index;
      delete obj.tooltip;

      obj = undefined;
   }

   JSROOT.Painter.HPainter_Create3DScene = function(arg) {

      if ((arg!==undefined) && (arg<0)) {

         if (typeof this.TestAxisVisibility === 'function')
            this.TestAxisVisibility(null, this.toplevel);

         this.clear_3d_canvas();

         JSROOT.Painter.DisposeThreejsObject(this.scene);
         if (this.control) this.control.dispose();

         delete this.size3d;
         delete this.scene;
         delete this.toplevel;
         delete this.tooltip_mesh;
         delete this.camera;
         delete this.pointLight;
         delete this.renderer;
         delete this.control;
         if ('render_tmout' in this) {
            clearTimeout(this.render_tmout);
            delete this.render_tmout;
         }
         return;
      }

      if ('toplevel' in this) {
         // it is indication that all 3D object created, just replace it with empty
         this.scene.remove(this.toplevel);
         JSROOT.Painter.DisposeThreejsObject(this.toplevel);
         delete this.toplevel;
         delete this.tooltip_mesh;
         if (this.control) this.control.HideTooltip();

         var newtop = new THREE.Object3D();
         this.scene.add(newtop);
         this.toplevel = newtop;

         this.Resize3D(); // set actual sizes

         return;
      }

      var size = this.size_for_3d();

      this.size3d = 100;

      // three.js 3D drawing
      this.scene = new THREE.Scene();
      //scene.fog = new THREE.Fog(0xffffff, 500, 3000);

      this.toplevel = new THREE.Object3D();
      this.scene.add(this.toplevel);
      this.scene_width = size.width;
      this.scene_height = size.height

      this.camera = new THREE.PerspectiveCamera(45, this.scene_width / this.scene_height, 1, 40*this.size3d);
      this.camera.position.set(-1.6*this.size3d, -3.5*this.size3d, 1.4*this.size3d);

      this.pointLight = new THREE.PointLight(0xffffff,1);
      this.camera.add( this.pointLight );
      this.pointLight.position.set( this.size3d/2, this.size3d/2, this.size3d/2 );

      var lookat = new THREE.Vector3(0,0,0.8*this.size3d);

      this.camera.up = new THREE.Vector3(0,0,1);
      this.camera.lookAt(lookat);
      this.scene.add( this.camera );

      this.webgl = JSROOT.Painter.TestWebGL();

      this.renderer = this.webgl ? new THREE.WebGLRenderer({ antialias : true, alpha: true }) :
                                   new THREE.CanvasRenderer({ antialias : true, alpha: true });
      //renderer.setClearColor(0xffffff, 1);
      // renderer.setClearColor(0x0, 0);
      this.renderer.setSize(this.scene_width, this.scene_height);

      this.add_3d_canvas(size, this.renderer.domElement);

      this.DrawXYZ = JSROOT.Painter.HPainter_DrawXYZ;
      this.Render3D = JSROOT.Painter.Render3D;
      this.Resize3D = JSROOT.Painter.Resize3D;
      this.BinHighlight3D = JSROOT.Painter.BinHighlight3D;

      this.first_render_tm = 0;
      this.enable_hightlight = false;
      this.enable_tooltip = true;

      this.control = JSROOT.Painter.CreateOrbitControl(this, this.camera, this.scene, this.renderer, lookat);

      var painter = this;

      this.control.ProcessMouseMove = function(intersects) {
         var tip = null, mesh = null;

         for (var i = 0; i < intersects.length; ++i) {
            if (intersects[i].object.tooltip) {
               tip = intersects[i].object.tooltip(intersects[i]);
               if (tip) { mesh = intersects[i].object; break; }
            }
         }

         if (tip && !tip.use_itself) {
            var delta = 1e-4*painter.size3d;
            if ((tip.x1 > tip.x2) || (tip.y1 > tip.y2) || (tip.z1 > tip.z2)) console.warn('check 3D hints coordinates');
            tip.x1 -= delta; tip.x2 += delta;
            tip.y1 -= delta; tip.y2 += delta;
            tip.z1 -= delta; tip.z2 += delta;
         }

         painter.BinHighlight3D(tip, mesh);

         return (painter.enable_tooltip && tip && tip.info) ? tip.info : "";
      }

      this.control.ProcessMouseLeave = function() {
         painter.BinHighlight3D(null);
      }

      this.control.ContextMenu = function(pos, intersects) {
         var kind = "hist";
         if (intersects)
            for (var n=0;n<intersects.length;++n)
               if (intersects[n].object.zoom) {
                  kind = intersects[n].object.zoom;
                  break;
               }
         painter.ShowContextMenu(kind, pos);
      }
   }

   JSROOT.Painter.HPainter_TestAxisVisibility = function(camera, toplevel, fb, bb) {
      var top;
      for (var n=0;n<toplevel.children.length;++n) {
         top = toplevel.children[n];
         if (top.axis_draw) break;
         top = undefined;
      }

      if (!top) return;

      if (!camera) {
         // this is case when axis drawing want to be removed
         toplevel.remove(top);
         delete this.TestAxisVisibility;
         return;
      }

      fb = fb ? true : false;
      bb = bb ? true : false;

      var qudrant = 1, pos = camera.position;
      if ((pos.x < 0) && (pos.y >= 0)) qudrant = 2;
      if ((pos.x >= 0) && (pos.y >= 0)) qudrant = 3;
      if ((pos.x >= 0) && (pos.y < 0)) qudrant = 4;

      function testvisible(id, range) {
         if (id <= qudrant) id+=4;
         return (id > qudrant) && (id < qudrant+range);
      }

      for (var n=0;n<top.children.length;++n) {
         var chld = top.children[n];
         if (chld.grid) chld.visible = bb && testvisible(chld.grid, 3); else
         if (chld.zid) chld.visible = testvisible(chld.zid, 2); else
         if (chld.xyid) chld.visible = testvisible(chld.xyid, 3); else
         if (chld.xyboxid) {
            var range = 5, shift = 0;
            if (bb && !fb) { range = 3; shift = -2; } else
            if (fb && !bb) range = 3; else
            if (!fb && !bb) range = (chld.bottom ? 3 : 0);
            chld.visible = testvisible(chld.xyboxid + shift, range);
            if (!chld.visible && chld.bottom && bb)
               chld.visible = testvisible(chld.xyboxid, 3);
         } else
         if (chld.zboxid) {
            var range = 2, shift = 0;
            if (fb && bb) range = 5; else
            if (bb && !fb) range = 4; else
            if (!bb && fb) { shift = -2; range = 4; }
            chld.visible = testvisible(chld.zboxid + shift, range);
         }
      }
   }

   JSROOT.Painter.HPainter_DrawXYZ = function(toplevel, opts) {
      if (!opts) opts = {};

      var grminx = -this.size3d, grmaxx = this.size3d,
          grminy = -this.size3d, grmaxy = this.size3d,
          grminz = 0, grmaxz = 2*this.size3d,
          textsize = Math.round(this.size3d * 0.05),
          pad = this.root_pad(),
          histo = this.histo,
          xmin = this.xmin, xmax = this.xmax,
          ymin = this.ymin, ymax = this.ymax,
          zmin = this.zmin, zmax = this.zmax,
          y_zoomed = false, z_zoomed = false;

      if (this.size3d === 0) {
         grminx = this.xmin; grmaxx = this.xmax;
         grminy = this.ymin; grmaxy = this.ymax;
         grminz = this.zmin; grmaxz = this.zmax;
         textsize = (grmaxz - grminz) * 0.05;
      }

      if (('zoom_xmin' in this) && ('zoom_xmax' in this) && (this.zoom_xmin !== this.zoom_xmax)) {
         xmin = this.zoom_xmin; xmax = this.zoom_xmax;
      }
      if (('zoom_ymin' in this) && ('zoom_ymax' in this) && (this.zoom_ymin !== this.zoom_ymax)) {
         ymin = this.zoom_ymin; ymax = this.zoom_ymax; y_zoomed = true;
      }

      if (('zoom_zmin' in this) && ('zoom_zmax' in this) && (this.zoom_zmin !== this.zoom_zmax)) {
         zmin = this.zoom_zmin; zmax = this.zoom_zmax; z_zoomed = true;
      }

      if (opts.use_y_for_z) {
         zmin = ymin; zmax = ymax; z_zoomed = y_zoomed;
         if (!z_zoomed) { zmin = this.hmin; zmax = this.hmax; }
         ymin = 0; ymax = 1;
      }

      // z axis range used for lego plot
      this.lego_zmin = zmin; this.lego_zmax = zmax;

      // factor 1.1 used in ROOT for lego plots
      if ((opts.zmult !== undefined) && !z_zoomed) zmax *= opts.zmult;

      this.TestAxisVisibility = JSROOT.Painter.HPainter_TestAxisVisibility;

      if (pad && pad.fLogx) {
         if (xmax <= 0) xmax = 1.;
         if ((xmin <= 0) && (this.nbinsx > 0))
            for (var i=0;i<this.nbinsx;++i) {
               xmin = Math.max(xmin, this.GetBinX(i));
               if (xmin>0) break;
            }
         if (xmin <= 0) xmin = 1e-4*xmax;
         this.grx = d3.scale.log();
         this.x_kind = "log";
      } else {
         this.grx = d3.scale.linear();
         if (histo && histo.fXaxis.fLabels) this.x_kind = "labels";
                                       else this.x_kind = "lin";
      }

      this.logx = (this.x_kind === "log");

      this.grx.domain([ xmin, xmax ]).range([ grminx, grmaxx ]);
      this.x_handle = new JSROOT.TAxisPainter(histo ? histo.fXaxis : null);
      this.x_handle.SetAxisConfig("xaxis", this.x_kind, this.grx, this.xmin, this.xmax, xmin, xmax);
      this.x_handle.CreateFormatFuncs();
      this.scale_xmin = xmin; this.scale_xmax = xmax;

      if (pad && pad.fLogy && !opts.use_y_for_z) {
         if (ymax <= 0) ymax = 1.;
         if ((ymin <= 0) && (this.nbinsy>0))
            for (var i=0;i<this.nbinsy;++i) {
               ymin = Math.max(ymin, this.GetBinY(i));
               if (ymin>0) break;
            }

         if (ymin <= 0) ymin = 1e-4*ymax;
         this.gry = d3.scale.log();
         this.y_kind = "log";
      } else {
         this.gry = d3.scale.linear();
         if (histo && histo.fYaxis.fLabels) this.y_kind = "labels";
                                       else this.y_kind = "lin";
      }

      this.logy = (this.y_kind === "log");

      this.gry.domain([ ymin, ymax ]).range([ grminy, grmaxy ]);
      this.y_handle = new JSROOT.TAxisPainter(histo ? histo.fYaxis : null);
      this.y_handle.SetAxisConfig("yaxis", this.y_kind, this.gry, this.ymin, this.ymax, ymin, ymax);
      this.y_handle.CreateFormatFuncs();
      this.scale_ymin = ymin; this.scale_ymax = ymax;

      if (pad && pad.fLogz) {
         if (zmax <= 0) zmax = 1;
         if (zmin <= 0) zmin = 1e-4*zmax;
         this.grz = d3.scale.log();
         this.z_kind = "log";
      } else {
         this.grz = d3.scale.linear();
         this.z_kind = "lin";
      }

      this.logz = (this.z_kind === "log");

      this.grz.domain([ zmin, zmax ]).range([ grminz, grmaxz ]);

      this.z_handle = new JSROOT.TAxisPainter(histo ? histo.fZaxis : null);
      this.z_handle.SetAxisConfig("zaxis", this.z_kind, this.grz, this.zmin, this.zmax, zmin, zmax);
      this.z_handle.CreateFormatFuncs();
      this.scale_zmin = zmin; this.scale_zmax = zmax;

      var textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }),
          lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }),
          ticklen = textsize*0.5, text, tick, lbls = [], text_scale = 1,
          xticks = this.x_handle.CreateTicks(),
          yticks = this.y_handle.CreateTicks(),
          zticks = this.z_handle.CreateTicks();


      // main element, where all axis elements are placed
      var top = new THREE.Object3D();
      top.axis_draw = true; // mark element as axis drawing
      toplevel.add(top);

      var ticks = [], maxtextheight = 0;

      while (xticks.next()) {
         var grx = xticks.grpos;
         var is_major = (xticks.kind===1);
         var lbl = this.x_handle.format(xticks.tick, true, true);
         if (xticks.last_major()) lbl = "x"; else
            if (lbl === null) { is_major = false; lbl = ""; }

         if (is_major && lbl && (lbl.length>0)) {
            var text3d = new THREE.TextGeometry(lbl, { font: JSROOT.threejs_font_helvetiker_regular, size: textsize, height: 0, curveSegments: 10 });
            text3d.computeBoundingBox();
            var draw_width = text3d.boundingBox.max.x - text3d.boundingBox.min.x,
                draw_height = text3d.boundingBox.max.y - text3d.boundingBox.min.y;
            text3d.translate(-draw_width/2, 0, 0);

            maxtextheight = Math.max(maxtextheight, draw_height);

            text3d.grx = grx;
            lbls.push(text3d);

            if (!xticks.last_major()) {
               var space = (xticks.next_major_grpos() - grx);
               if (draw_width > 0)
                  text_scale = Math.min(text_scale, 0.9*space/draw_width)
               if (this.x_handle.IsCenterLabels()) text3d.grx += space/2;
            }
         }

         ticks.push(grx, 0, 0, grx, (is_major ? -ticklen : -ticklen * 0.6), 0);
      }

      var ggg1 = new THREE.Geometry(), ggg2 = new THREE.Geometry();

      lbls.forEach(function(lbl) {
         var m = new THREE.Matrix4();
         // matrix to swap y and z scales and shift along z to its position
         m.set(text_scale, 0,           0,  lbl.grx,
               0,          text_scale,  0,  -maxtextheight*text_scale - 1.5*ticklen,
               0,          0,           1,  0);

         ggg1.merge(lbl, m);

         m.set(-text_scale, 0,           0, lbl.grx,
               0,           text_scale,  0, -maxtextheight*text_scale - 1.5*ticklen,
               0,           0,           1, 0);

         ggg2.merge(lbl, m);
      });

      ggg1 = new THREE.BufferGeometry().fromGeometry(ggg1);
      ggg2 = new THREE.BufferGeometry().fromGeometry(ggg2);

      var ticksgeom = new THREE.BufferGeometry();
      ticksgeom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(ticks), 3 ) );

      function CreateZoomMesh(kind, size3d) {
         var geom = new THREE.Geometry();

         if (kind==="z")
            geom.vertices.push(
                  new THREE.Vector3(0,0,0),
                  new THREE.Vector3(ticklen*4, 0, 0),
                  new THREE.Vector3(ticklen*4, 0, 2*size3d),
                  new THREE.Vector3(0, 0, 2*size3d));
         else
            geom.vertices.push(
                  new THREE.Vector3(-size3d,0,0),
                  new THREE.Vector3(size3d,0,0),
                  new THREE.Vector3(size3d,-ticklen*4,0),
                  new THREE.Vector3(-size3d,-ticklen*4,0));

         geom.faces.push(new THREE.Face3(0, 2, 1));
         geom.faces.push(new THREE.Face3(0, 3, 2));
         geom.computeFaceNormals();

         var material = new THREE.MeshBasicMaterial({ transparent: true,
                                   vertexColors: THREE.NoColors, //   THREE.FaceColors,
                                   side: THREE.DoubleSide,
                                   opacity: 0 });

         var mesh = new THREE.Mesh(geom, material);
         mesh.zoom = kind;
         mesh.size3d = size3d;
         if (kind=="y") mesh.rotateZ(Math.PI/2).rotateX(Math.PI);

         mesh.GlobalIntersect = function(raycaster) {
            var plane = new THREE.Plane(),
                geom = this.geometry;

            plane.setFromCoplanarPoints(geom.vertices[0], geom.vertices[1], geom.vertices[2]);
            plane.applyMatrix4(this.matrixWorld);

            var v1 = raycaster.ray.origin.clone(),
                v2 = v1.clone().addScaledVector(raycaster.ray.direction, 1e10);

            var pnt = plane.intersectLine(new THREE.Line3(v1,v2));

            if (!pnt) return undefined;

            var min = -this.size3d, max = this.size3d;
            if (this.zoom==="z") { min = 0; max = 2*this.size3d; }

            if (pnt[this.zoom] < min) pnt[this.zoom] = min; else
            if (pnt[this.zoom] > max) pnt[this.zoom] = max;

            return pnt;
         }

         mesh.ShowSelection = function(pnt1,pnt2) {
            // used to show selection

            var tgtmesh = this.children[0], gg, kind = this.zoom;
            if (!pnt1 || !pnt2) {
               if (tgtmesh) {
                  this.remove(tgtmesh)
                  JSROOT.Painter.DisposeThreejsObject(tgtmesh);
               }
               return tgtmesh;
            }

            if (!tgtmesh) {
               gg = this.geometry.clone();
               if (kind==="z") gg.vertices[1].x = gg.vertices[2].x = ticklen;
                          else gg.vertices[2].y = gg.vertices[3].y = -ticklen;
               tgtmesh = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: 0xFF00, side: THREE.DoubleSide }));
               this.add(tgtmesh);
            } else {
               gg = tgtmesh.geometry;
            }

            if (kind=="z") {
               gg.vertices[0].z = gg.vertices[1].z = pnt1[kind];
               gg.vertices[2].z = gg.vertices[3].z = pnt2[kind];
            } else {
               gg.vertices[0].x = gg.vertices[3].x = pnt1[kind];
               gg.vertices[1].x = gg.vertices[2].x = pnt2[kind];
            }

            gg.computeFaceNormals();

            gg.verticesNeedUpdate = true;
            gg.normalsNeedUpdate = true;

            return true;
         }

         return mesh;
      }

      var xcont = new THREE.Object3D();
      xcont.position.set(0, grminy, grminz)
      xcont.rotation.x = 1/4*Math.PI;
      xcont.xyid = 2;
      xcont.add(new THREE.LineSegments(ticksgeom, lineMaterial));
      xcont.add(new THREE.Mesh(ggg1, textMaterial));
      if (opts.zoom) xcont.add(CreateZoomMesh("x", this.size3d));
      top.add(xcont);

      xcont = new THREE.Object3D();
      xcont.position.set(0, grmaxy, grminz);
      xcont.rotation.x = 3/4*Math.PI;
      xcont.add(new THREE.LineSegments(ticksgeom, lineMaterial));
      xcont.add(new THREE.Mesh(ggg2, textMaterial));
      xcont.xyid = 4;
      if (opts.zoom) xcont.add(CreateZoomMesh("x", this.size3d));
      top.add(xcont);

      lbls = []; text_scale = 1; maxtextheight = 0; ticks = [];

      while (yticks.next()) {
         var gry = yticks.grpos;
         var is_major = (yticks.kind===1);
         var lbl = this.y_handle.format(yticks.tick, true, true);
         if (yticks.last_major()) lbl = "y"; else
            if (lbl === null) { is_major = false; lbl = ""; }

         if (is_major) {
            var text3d = new THREE.TextGeometry(lbl, { font: JSROOT.threejs_font_helvetiker_regular, size: textsize, height: 0, curveSegments: 10 });
            text3d.computeBoundingBox();
            var draw_width = text3d.boundingBox.max.x - text3d.boundingBox.min.x,
                draw_height = text3d.boundingBox.max.y - text3d.boundingBox.min.y;
            text3d.translate(-draw_width/2, 0, 0);

            maxtextheight = Math.max(maxtextheight, draw_height);

            text3d.gry = gry;
            lbls.push(text3d);

            if (!yticks.last_major()) {
               var space = (yticks.next_major_grpos() - gry);
               if (draw_width > 0)
                  text_scale = Math.min(text_scale, 0.9*space/draw_width)
               if (this.y_handle.IsCenterLabels()) text3d.gry += space/2;
            }
         }
         ticks.push(0,gry,0, (is_major ? -ticklen : -ticklen*0.6), gry, 0);
      }


      var ggg1 = new THREE.Geometry(), ggg2 = new THREE.Geometry();

      lbls.forEach(function(lbl) {
         var m = new THREE.Matrix4();
         m.set(0, text_scale,  0, -maxtextheight*text_scale - 1.5*ticklen,
               -text_scale,  0, 0, lbl.gry,
               0, 0,  1, 0);

         ggg1.merge(lbl, m);

         m.set(0, text_scale,  0, -maxtextheight*text_scale - 1.5*ticklen,
               text_scale,  0, 0, lbl.gry,
               0, 0,  1, 0);

         ggg2.merge(lbl, m);

      });

      ggg1 = new THREE.BufferGeometry().fromGeometry(ggg1);
      ggg2 = new THREE.BufferGeometry().fromGeometry(ggg2);

      var ticksgeom = new THREE.BufferGeometry();
      ticksgeom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(ticks), 3 ) );

      if (!opts.use_y_for_z) {
         var ycont = new THREE.Object3D();
         ycont.position.set(grminx, 0, grminz);
         ycont.rotation.y = -1/4*Math.PI;
         ycont.add(new THREE.LineSegments(ticksgeom, lineMaterial));
         ycont.add(new THREE.Mesh(ggg1, textMaterial));
         ycont.xyid = 3;
         if (opts.zoom) ycont.add(CreateZoomMesh("y", this.size3d));
         top.add(ycont);

         ycont = new THREE.Object3D();
         ycont.position.set(grmaxx, 0, grminz);
         ycont.rotation.y = -3/4*Math.PI;
         ycont.add(new THREE.LineSegments(ticksgeom, lineMaterial));
         ycont.add(new THREE.Mesh(ggg2, textMaterial));
         ycont.xyid = 1;
         if (opts.zoom) ycont.add(CreateZoomMesh("y", this.size3d));
         top.add(ycont);
      }


      lbls = []; text_scale = 1;

      var ticks = []; // just array, will be used for the buffer geometry

      var zgridx = null, zgridy = null, lastmajorz = null;
      if (this.size3d !== 0) {
         zgridx = []; zgridy = [];
      }

      while (zticks.next()) {
         var grz = zticks.grpos;
         var is_major = zticks.kind == 1;

         var lbl = this.z_handle.format(zticks.tick, true, true);
         if (lbl === null) { is_major = false; lbl = ""; }

         if (is_major && lbl && (lbl.length > 0)) {
            var text3d = new THREE.TextGeometry(lbl, { font: JSROOT.threejs_font_helvetiker_regular, size : textsize, height : 0, curveSegments : 10 });
            text3d.computeBoundingBox();
            var draw_width = text3d.boundingBox.max.x - text3d.boundingBox.min.x,
                draw_height = text3d.boundingBox.max.y - text3d.boundingBox.min.y;
            text3d.translate(-draw_width, -draw_height/2, 0);
            text3d.grz = grz;
            lbls.push(text3d);

            if ((lastmajorz !== null) && (draw_height>0))
               text_scale = Math.min(text_scale, 0.9*(grz - lastmajorz)/draw_height);

            lastmajorz = grz;
         }

         // create grid
         if (zgridx && is_major)
            zgridx.push(grminx, 0, grz, grmaxx, 0, grz);

         if (zgridy && is_major)
            zgridy.push(0, grminy, grz, 0, grmaxy, grz);

         ticks.push(0, 0, grz, (is_major ? ticklen : ticklen * 0.6), 0, grz);
      }


      if (zgridx && (zgridx.length > 0)) {

         // var material = new THREE.LineBasicMaterial({ color: 0x0, linewidth: 0.5 });
         var material = new THREE.LineDashedMaterial( { color: 0x0, dashSize: 2, gapSize: 2 } );

         //var geom =  new THREE.BufferGeometry();
         //geom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(zgridx), 3 ) );
         var geom =  new THREE.Geometry();
         for(i = 0; i < zgridx.length; i += 3 ){
            geom.vertices.push( new THREE.Vector3( zgridx[i], zgridx[i+1], zgridx[i+2]) );
         }
         geom.computeLineDistances();

         var lines = new THREE.LineSegments(geom, material);
         lines.position.set(0,grmaxy,0);
         lines.grid = 2; // mark as grid
         lines.visible = false;
         top.add(lines);

         lines = new THREE.LineSegments(geom, material);
         lines.position.set(0,grminy,0);
         lines.grid = 4; // mark as grid
         lines.visible = false;
         top.add(lines);
      }

      if (zgridy && (zgridy.length > 0)) {

         // var material = new THREE.LineBasicMaterial({ color: 0x0, linewidth: 0.5 });
         var material = new THREE.LineDashedMaterial( { color: 0x0, dashSize: 2, gapSize: 2  } );

         //var geom =  new THREE.BufferGeometry();
         //geom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(zgridy), 3 ) );
         var geom =  new THREE.Geometry();
         for(i = 0; i < zgridy.length; i += 3 ){
            geom.vertices.push( new THREE.Vector3( zgridy[i], zgridy[i+1], zgridy[i+2]) );
         }
         geom.computeLineDistances();

         var lines = new THREE.LineSegments(geom, material);
         lines.position.set(grmaxx,0, 0);
         lines.grid = 3; // mark as grid
         lines.visible = false;
         top.add(lines);

         lines = new THREE.LineSegments(geom, material);
         lines.position.set(grminx, 0, 0);
         lines.grid = 1; // mark as grid
         lines.visible = false;
         top.add(lines);
      }


      var ggg = new THREE.Geometry();

      lbls.forEach(function(lbl) {
         var m = new THREE.Matrix4();
         // matrix to swap y and z scales and shift along z to its position
         m.set(-text_scale,          0,  0, 2*ticklen,
                        0,          0,  1, 0,
                        0, text_scale,  0, lbl.grz);

         ggg.merge(lbl, m);
      });

      ggg = new THREE.BufferGeometry().fromGeometry(ggg);

      var ticksgeom = new THREE.BufferGeometry();
      ticksgeom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(ticks), 3 ) );

      // ticks = new THREE.BufferGeometry().fromGeometry(ticks);

      var zcont = [];
      for (var n=0;n<4;++n) {
         zcont.push(new THREE.Object3D());
         zcont[n].add(new THREE.Mesh(ggg, textMaterial));
         zcont[n].add(new THREE.LineSegments(ticksgeom, lineMaterial));
         if (opts.zoom) zcont[n].add(CreateZoomMesh("z", this.size3d));

         zcont[n].zid = n + 2;
         top.add(zcont[n]);
      }

      zcont[0].position.set(grminx,grmaxy,0);
      zcont[0].rotation.z = 3/4*Math.PI;

      zcont[1].position.set(grmaxx,grmaxy,0);
      zcont[1].rotation.z = 1/4*Math.PI;

      zcont[2].position.set(grmaxx,grminy,0);
      zcont[2].rotation.z = -1/4*Math.PI;

      zcont[3].position.set(grminx,grminy,0);
      zcont[3].rotation.z = -3/4*Math.PI;


      // for TAxis3D do not show final cube
      if (this.size3d === 0) return;

      var linex = new THREE.BufferGeometry();
      linex.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array([grminx, 0, 0, grmaxx, 0, 0]), 3 ) );
      for(var n=0;n<2;++n) {
         var line = new THREE.LineSegments(linex, lineMaterial);
         line.position.set(0, grminy, (n===0) ? grminz : grmaxz);
         line.xyboxid = 2; line.bottom = (n == 0);
         top.add(line);

         line = new THREE.LineSegments(linex, lineMaterial);
         line.position.set(0, grmaxy, (n===0) ? grminz : grmaxz);
         line.xyboxid = 4; line.bottom = (n == 0);
         top.add(line);
      }

      var liney = new THREE.BufferGeometry();
      liney.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array([0, grminy,0, 0, grmaxy, 0]), 3 ) );
      for(var n=0;n<2;++n) {
         var line = new THREE.LineSegments(liney, lineMaterial);
         line.position.set(grminx, 0, (n===0) ? grminz : grmaxz);
         line.xyboxid = 3; line.bottom = (n == 0);
         top.add(line);

         line = new THREE.LineSegments(liney, lineMaterial);
         line.position.set(grmaxx, 0, (n===0) ? grminz : grmaxz);
         line.xyboxid = 1; line.bottom = (n == 0);
         top.add(line);
      }

      var linez = new THREE.BufferGeometry();
      linez.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array([0, 0, grminz, 0, 0, grmaxz]), 3 ) );
      for(var n=0;n<4;++n) {
         var line = new THREE.LineSegments(linez, lineMaterial);
         line.zboxid = zcont[n].zid;
         line.position.copy(zcont[n].position);
         top.add(line);
      }
   }

   JSROOT.Painter.Box_Vertices = [
       new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 0),
       new THREE.Vector3(1, 0, 1), new THREE.Vector3(1, 0, 0),
       new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 1),
       new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)
   ];

   JSROOT.Painter.Box_Indexes = [ 0,2,1, 2,3,1, 4,6,5, 6,7,5, 4,5,1, 5,0,1, 7,6,2, 6,3,2, 5,7,0, 7,2,0, 1,3,4, 3,6,4 ];

   JSROOT.Painter.Box_Normals = [ 1,0,0, -1,0,0, 0,1,0, 0,-1,0, 0,0,1, 0,0,-1 ];

   // segments addresses Box_Vertices
   JSROOT.Painter.Box_Segments = [0, 2, 2, 7, 7, 5, 5, 0, 1, 3, 3, 6, 6, 4, 4, 1, 1, 0, 3, 2, 6, 7, 4, 5];

   // these segments address vertices from the mesh, we can use positions from box mesh
   JSROOT.Painter.Box_MeshSegments = (function() {
      var arr = new Int32Array(JSROOT.Painter.Box_Segments.length);
      for (var n=0;n<arr.length;++n) {
         for (var k=0;k<JSROOT.Painter.Box_Indexes.length;++k)
            if (JSROOT.Painter.Box_Segments[n] === JSROOT.Painter.Box_Indexes[k]) {
               arr[n] = k; break;
            }
      }
      return arr;
   })();

   JSROOT.Painter.BinHighlight3D = function(tip, selfmesh) {

      var changed = false, tooltip_mesh = null, changed_self = true,
          want_remove = !tip || (tip.x1===undefined) || !this.enable_hightlight || !this.enable_tooltip;

      if (this.tooltip_selfmesh) {
         changed_self = (this.tooltip_selfmesh !== selfmesh)
         this.tooltip_selfmesh.material.color = this.tooltip_selfmesh.save_color;
         delete this.tooltip_selfmesh;
         changed = true;
      }

      if (this.tooltip_mesh) {
         tooltip_mesh = this.tooltip_mesh;
         this.toplevel.remove(this.tooltip_mesh);
         delete this.tooltip_mesh;
         changed = true;
      }

      if (want_remove) {
         if (changed) this.Render3D();
         this.ProvideUserTooltip(null);
         return;
      }

      if (tip.use_itself) {
         selfmesh.save_color = selfmesh.material.color;
         selfmesh.material.color = new THREE.Color(tip.color);
         this.tooltip_selfmesh = selfmesh;
         changed = changed_self;
      } else {
         changed = true;

         var indicies = JSROOT.Painter.Box_Indexes,
             normals = JSROOT.Painter.Box_Normals,
             vertices = JSROOT.Painter.Box_Vertices,
             pos, norm,
             color = new THREE.Color(tip.color ? tip.color : 0xFF0000);

         if (!tooltip_mesh) {
            pos = new Float32Array(indicies.length*3);
            norm = new Float32Array(indicies.length*3);
            var geom = new THREE.BufferGeometry();
            geom.addAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
            geom.addAttribute( 'normal', new THREE.BufferAttribute( norm, 3 ) );
            var mater = new THREE.MeshBasicMaterial( { color: color, shading: THREE.SmoothShading  } );
            tooltip_mesh = new THREE.Mesh(geom, mater);
         } else {
            pos = tooltip_mesh.geometry.attributes.position.array;
            tooltip_mesh.geometry.attributes.position.needsUpdate = true;
            tooltip_mesh.material.color = color;
         }

         if (tip.x1 === tip.x2) console.warn('same tip X', tip.x1, tip.x2);
         if (tip.y1 === tip.y2) console.warn('same tip Y', tip.y1, tip.y2);
         if (tip.z1 === tip.z2) { tip.z2 = tip.z1 + 0.0001; } // avoid zero faces

         for (var k=0,nn=-3;k<indicies.length;++k) {
            var vert = vertices[indicies[k]];
            pos[k*3]   = tip.x1 + vert.x * (tip.x2 - tip.x1);
            pos[k*3+1] = tip.y1 + vert.y * (tip.y2 - tip.y1);
            pos[k*3+2] = tip.z1 + vert.z * (tip.z2 - tip.z1);

            if (norm) {
               if (k%6===0) nn+=3;
               norm[k*3] = normals[nn];
               norm[k*3+1] = normals[nn+1];
               norm[k*3+2] = normals[nn+2];
            }
         }
         this.tooltip_mesh = tooltip_mesh;
         this.toplevel.add(tooltip_mesh);
      }

      if (changed) this.Render3D();

      if (this.IsUserTooltipCallback() && this.GetObject()) {
         this.ProvideUserTooltip({ obj: this.GetObject(),  name: this.GetObject().fName,
                                   bin: tip.bin, cont: tip.value,
                                   binx: tip.ix, biny: tip.iy, binz: tip.iz,
                                   grx: (tip.x1+tip.x2)/2, gry: (tip.y1+tip.y2)/2, grz: (tip.z1+tip.z2)/2 });
      }
   }

   JSROOT.Painter.HistPainter_DrawLego = function() {

      if (this.IsTH2Poly()) return JSROOT.Painter.HistPainter_DrawPolyLego.call(this);

      if (this.options.Surf && (this.Dimension()==2))
         return JSROOT.Painter.HistPainter_DrawTH2Surf.call(this);

      // Perform TH1/TH2 lego plot with BufferGeometry

      var vertices = JSROOT.Painter.Box_Vertices,
          indicies = JSROOT.Painter.Box_Indexes,
          vnormals = JSROOT.Painter.Box_Normals,
          segments = JSROOT.Painter.Box_Segments,
          // reduced line segments
          rsegments = [0, 1, 1, 2, 2, 3, 3, 0],
          // reduced vertices
          rvertices = [ new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(1, 0, 0) ],
          axis_zmin = this.grz.domain()[0],
          axis_zmax = this.grz.domain()[1],
          handle = this.PrepareColorDraw({ rounding: false, size3d: this.size3d, extra: 1 });

      // create the bin cubes
      var showmin = !this.options.Zero || (axis_zmin>0);

      var i1 = handle.i1, i2 = handle.i2, j1 = handle.j1, j2 = handle.j2,
          i, j, x1, x2, y1, y2, binz, reduced, nobottom, notop,
          main = this.main_painter(),
          split_faces = ((this.options.Lego === 11) || (this.options.Lego === 13)) && (this.GetObject().fFillColor<2); // split each layer on two parts


      if ((i1 >= i2) || (j1 >= j2)) return;

      // if bin ID fit into 16 bit, use smaller arrays for intersect indexes
      var use16indx = (this.histo.getBin(i2, j2) < 0xFFFF);

      // DRAW ALL CUBES

      var levels = [ axis_zmin, axis_zmax ], palette = null, totalvertices = 0;

      if ((this.options.Lego === 12) || (this.options.Lego === 14)) {
         var nlevels = 20;
         if (this.histo.fContour != null) nlevels = this.histo.fContour.length;
         levels = this.CreateContour(nlevels, this.lego_zmin, this.lego_zmax);
         palette = this.GetPalette();
      }

      for (var nlevel=0; nlevel<levels.length-1;++nlevel) {

         var zmin = levels[nlevel], zmax = levels[nlevel+1],
             z1 = this.grz(zmin), z2 = 0, zzz = this.grz(zmax),
             numvertices = 0, num2vertices = 0;

         // now calculate size of buffer geometry for boxes

         for (i=i1;i<i2;++i)
            for (j=j1;j<j2;++j) {
               binz = this.histo.getBinContent(i+1, j+1);
               if (binz < zmin) continue;
               reduced = (binz === zmin);
               if (reduced && ((nlevel>0) || !showmin)) continue;
               nobottom = !reduced && (nlevel>0);
               notop = !reduced && (binz > zmax) && (nlevel < levels.length-2);

               numvertices += (reduced ? 12 : indicies.length);
               if (nobottom) numvertices -= 6;
               if (notop) numvertices -= 6;

               if (split_faces && !reduced) {
                  numvertices -= 12;
                  num2vertices += 12;
               }
            }

         totalvertices += numvertices + num2vertices;

         var positions = new Float32Array(numvertices*3),
             normals = new Float32Array(numvertices*3),
             bins_index = use16indx ? new Uint16Array(numvertices) : new Uint32Array(numvertices),
             pos2 = null, norm2 = null, indx2 = null,
             v = 0, v2 = 0, vert, bin, k, nn;

         if (num2vertices > 0) {
            pos2 = new Float32Array(num2vertices*3);
            norm2 = new Float32Array(num2vertices*3);
            indx2 = use16indx ? new Uint16Array(num2vertices) : new Uint32Array(num2vertices);
         }

         for (i=i1;i<i2;++i) {
            x1 = handle.grx[i];
            x2 = handle.grx[i+1];
            for (j=j1;j<j2;++j) {
               binz = this.histo.getBinContent(i+1, j+1);
               if (binz < zmin) continue;
               reduced = (binz === zmin);
               if (reduced && ((nlevel>0) || !showmin)) continue;
               nobottom = !reduced && (nlevel>0);
               notop = !reduced && (binz > zmax) && (nlevel < levels.length-2);

               y1 = handle.gry[j];
               y2 = handle.gry[j+1];

               z2 = (binz > zmax) ? zzz : this.grz(binz);

               nn = 0; // counter over the normals, each normals correspond to 6 vertices
               k = 0; // counter over vertices

               if (reduced) {
                  // we skip all side faces, keep only top and bottom
                  nn += 12;
                  k += 24;
               }

               var size = indicies.length, bin_index = this.histo.getBin(i+1, j+1);
               if (nobottom) size -= 6;

               // array over all vertices of the single bin
               while(k < size) {

                  vert = vertices[indicies[k]];

                  if (split_faces && (k < 12)) {
                     pos2[v2]   = x1 + vert.x * (x2 - x1);
                     pos2[v2+1] = y1 + vert.y * (y2 - y1);
                     pos2[v2+2] = z1 + vert.z * (z2 - z1);

                     norm2[v2] = vnormals[nn];
                     norm2[v2+1] = vnormals[nn+1];
                     norm2[v2+2] = vnormals[nn+2];

                     indx2[v2/3] = bin_index; // remember which bin corresponds to the vertex
                     v2+=3;
                  } else {
                     positions[v]   = x1 + vert.x * (x2 - x1);
                     positions[v+1] = y1 + vert.y * (y2 - y1);
                     positions[v+2] = z1 + vert.z * (z2 - z1);

                     normals[v] = vnormals[nn];
                     normals[v+1] = vnormals[nn+1];
                     normals[v+2] = vnormals[nn+2];
                     bins_index[v/3] = bin_index; // remember which bin corresponds to the vertex
                     v+=3;
                  }

                  ++k;

                  if (k%6 === 0) {
                     nn+=3;
                     if (notop && (k === indicies.length - 12)) {
                        k+=6; nn+=3; // jump over notop indexes
                     }
                  }
               }
            }
         }

         var geometry = new THREE.BufferGeometry();
         geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
         geometry.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
         // geometry.computeVertexNormals();

         var rootcolor = this.GetObject().fFillColor,
             fcolor = JSROOT.Painter.root_colors[rootcolor];

         if (palette) {
            var indx = Math.floor((nlevel+0.99)*palette.length/(levels.length-1));
            if (indx > palette.length-1) indx = palette.length-1;
            fcolor = palette[indx];
         } else {
            if ((this.options.Lego === 1) || (rootcolor < 2)) {
               rootcolor = 1;
               fcolor = 'white';
            }
         }

         //var material = new THREE.MeshLambertMaterial( { color: fcolor } );
         var material = new THREE.MeshBasicMaterial( { color: fcolor, shading: THREE.SmoothShading  } );

         var mesh = new THREE.Mesh(geometry, material);

         mesh.bins_index = bins_index;
         mesh.painter = this;
         mesh.zmin = axis_zmin;
         mesh.zmax = axis_zmax;
         mesh.tip_color = (rootcolor===3) ? 0xFF0000 : 0x00FF00;

         mesh.tooltip = function(intersect) {
            if ((intersect.index<0) || (intersect.index >= this.bins_index.length)) return null;
            var p = this.painter,
                tip = p.Get3DToolTip( this.bins_index[intersect.index] );

            tip.x1 = Math.max(-p.size3d, p.grx(p.GetBinX(tip.ix-1)));
            tip.x2 = Math.min(p.size3d, p.grx(p.GetBinX(tip.ix)));
            if (p.Dimension()===1) {
               tip.y1 = p.gry(0);
               tip.y2 = p.gry(1);
            } else {
               tip.y1 = Math.max(-p.size3d, p.gry(p.GetBinY(tip.iy-1)));
               tip.y2 = Math.min(p.size3d, p.gry(p.GetBinY(tip.iy)));
            }
            tip.z1 = p.grz(this.zmin);
            tip.z2 = p.grz(this.zmax);

            if (tip.value<this.zmin) tip.z2 = tip.z1; else
            if (tip.value<this.zmax) tip.z2 = p.grz(tip.value);

            tip.color = this.tip_color;

            return tip;
         }

         this.toplevel.add(mesh);

         if (num2vertices > 0) {
            var geom2 = new THREE.BufferGeometry();
            geom2.addAttribute( 'position', new THREE.BufferAttribute( pos2, 3 ) );
            geom2.addAttribute( 'normal', new THREE.BufferAttribute( norm2, 3 ) );
            //geom2.computeVertexNormals();

            //var material2 = new THREE.MeshLambertMaterial( { color: 0xFF0000 } );
            var material2 = new THREE.MeshBasicMaterial( { color: 0xFF0000, shading: THREE.SmoothShading } );

            var mesh2 = new THREE.Mesh(geom2, material2);
            mesh2.bins_index = indx2;
            mesh2.painter = this;
            mesh2.tooltip = mesh.tooltip;
            mesh2.zmin = mesh.zmin;
            mesh2.zmax = mesh.zmax;
            mesh2.tip_color = mesh.tip_color;

            this.toplevel.add(mesh2);
         }
      }

      // console.log('Total number of lego vertices', totalvertices);

      // lego3 or lego4 do not draw border lines
      if (this.options.Lego > 12) return;

      // DRAW LINE BOXES

      var numlinevertices = 0, numsegments = 0, uselineindx = true;

      for (i=i1;i<i2;++i)
         for (j=j1;j<j2;++j) {
            binz = this.histo.getBinContent(i+1, j+1);
            if (binz < axis_zmin) continue;
            reduced = (binz == axis_zmin);
            if (reduced && !showmin) continue;

            // calculate required buffer size for line segments

            numlinevertices += (reduced ? rvertices.length : vertices.length);
            numsegments += (reduced ? rsegments.length : segments.length);
         }

      // On some platforms vertex index required to be Uint16 array
      // While we cannot use index for large vertex list
      // skip index usage at all. It happens for relatively large histograms (100x100 bins)
      if (numlinevertices > 0xFFF0) uselineindx = false;

      if (!uselineindx) numlinevertices = numsegments*3;

      var lpositions = new Float32Array( numlinevertices * 3 ),
          lindicies = uselineindx ? new Uint16Array( numsegments ) : null;
//          intersect_size = uselineindx ? numsegments : numlinevertices,
//          intersect_index = use16indx ? new Uint16Array( intersect_size ) : new Uint32Array( intersect_size );

      var z1 = this.grz(axis_zmin), zzz = this.grz(axis_zmax),
          z2 = 0, ll = 0, ii = 0;

      for (i=i1;i<i2;++i) {
         x1 = handle.grx[i];
         x2 = handle.grx[i+1];
         for (j=j1;j<j2;++j) {
            binz = this.histo.getBinContent(i+1, j+1);
            if (binz < axis_zmin) continue;
            reduced = (binz == axis_zmin);
            if (reduced && !showmin) continue;

            y1 = handle.gry[j];
            y2 = handle.gry[j+1];

            z2 = (binz > zmax) ? zzz : this.grz(binz);

            var seg = reduced ? rsegments : segments,
                vvv = reduced ? rvertices : vertices;
//                bin_index = this.histo.getBin(i+1, j+1);


            if (uselineindx) {
               // array of indicies for the lines, to avoid duplication of points
               for (k=0; k < seg.length; ++k) {
//                  intersect_index[ii] = bin_index;
                  lindicies[ii++] = ll/3 + seg[k];
               }

               for (k=0; k < vvv.length; ++k) {
                  vert = vvv[k];
                  lpositions[ll]   = x1 + vert.x * (x2 - x1);
                  lpositions[ll+1] = y1 + vert.y * (y2 - y1);
                  lpositions[ll+2] = z1 + vert.z * (z2 - z1);
                  ll+=3;
               }
            } else {
               // copy only vertex positions
               for (k=0; k < seg.length; ++k) {
                  vert = vvv[seg[k]];
                  lpositions[ll]   = x1 + vert.x * (x2 - x1);
                  lpositions[ll+1] = y1 + vert.y * (y2 - y1);
                  lpositions[ll+2] = z1 + vert.z * (z2 - z1);
//                  intersect_index[ll/3] = bin_index;
                  ll+=3;
               }
            }
         }
      }

      // create boxes
      geometry = new THREE.BufferGeometry();
      geometry.addAttribute( 'position', new THREE.BufferAttribute( lpositions, 3 ) );
      if (uselineindx)
         geometry.setIndex(new THREE.BufferAttribute(lindicies, 1));

      var lcolor = JSROOT.Painter.root_colors[this.GetObject().fLineColor];

      material = new THREE.LineBasicMaterial({ color: new THREE.Color(lcolor) });
      if (!JSROOT.browser.isIE) material.linewidth = this.GetObject().fLineWidth;
      var line = new THREE.LineSegments(geometry, material);

      /*
      line.painter = this;
      line.intersect_index = intersect_index;
      line.tooltip = function(intersect) {
         if ((intersect.index<0) || (intersect.index >= this.intersect_index.length)) return null;
         return this.painter.Get3DToolTip(this.intersect_index[intersect.index]);
      }
      */

      this.toplevel.add(line);
   }

   JSROOT.Painter.HistPainter_DrawTH2Surf = function() {
      var histo = this.GetObject(),
          handle = this.PrepareColorDraw({rounding: false, size3d: this.size3d, extra: 1, middle: 0.5 }),
          i,j, x1, y1, x2, y2, z11, z12, z21, z22,
          main = this.main_painter(),
          axis_zmin = main.grz.domain()[0],
          axis_zmax = main.grz.domain()[1];

      // first adjust ranges

      var main_grz = !main.logz ? main.grz : function(value) { return value < axis_zmin ? -0.1 : main.grz(value); }

      if ((handle.i2 - handle.i1 < 2) || (handle.j2 - handle.j1 < 2)) return;

      var ilevels = null, levels = null, dolines = true, docolorfaces = false, dogrid = false,
          donormals = false;

      switch(this.options.Surf) {
         case 11: ilevels = this.GetContour(); docolorfaces = true; break;
         case 12: ilevels = this.GetContour(); docolorfaces = true; dolines = false; break;
         case 14: dolines = false; donormals = true; break;
         case 16: ilevels = this.GetContour(); dogrid = true; dolines = false; break;
         default: ilevels = main.z_handle.CreateTicks(true); dogrid = true; break;
      }

      if (ilevels) {
         // recalculate levels into graphical coordinates
         levels = new Float32Array(ilevels.length);
         for (var ll=0;ll<ilevels.length;++ll)
            levels[ll] = main_grz(ilevels[ll]);
      } else {
         levels = [0, 2*main.size3d]; // just cut top/bottom parts
      }

      var loop, nfaces = [], pos = [], indx = [],    // buffers for faces
          nsegments = 0, lpos = null, lindx = 0,     // buffer for lines
          ngridsegments = 0, grid = null, gindx = 0, // buffer for grid lines segments
          normindx = null;                           // buffer to remember place of vertex for each bin

      function CheckSide(z,level1, level2) {
         if (z<level1) return -1;
         if (z>level2) return 1;
         return 0;
      }

      function AddLineSegment(x1,y1,z1, x2,y2,z2) {
         if (!dolines) return;
         var side1 = CheckSide(z1,0,2*main.size3d),
             side2 = CheckSide(z2,0,2*main.size3d);
         if ((side1===side2) && (side1!==0)) return;
         if (!loop) return ++nsegments;

         if (side1!==0) {
            var diff = z2-z1;
            z1 = (side1<0) ? 0 : 2*main.size3d;
            x1 = x2 - (x2-x1)/diff*(z2-z1);
            y1 = y2 - (y2-y1)/diff*(z2-z1);
         }
         if (side2!==0) {
            var diff = z1-z2;
            z2 = (side2<0) ? 0 : 2*main.size3d;
            x2 = x1 - (x1-x2)/diff*(z1-z2);
            y2 = y1 - (y1-y2)/diff*(z1-z2);
         }

         lpos[lindx] = x1; lpos[lindx+1] = y1; lpos[lindx+2] = z1; lindx+=3;
         lpos[lindx] = x2; lpos[lindx+1] = y2; lpos[lindx+2] = z2; lindx+=3;
      }

      var pntbuf = new Float32Array(6*3), k = 0, lastpart = 0; // maximal 6 points
      var gridpnts = new Float32Array(2*3), gridcnt = 0;

      function AddCrossingPoint(xx1,yy1,zz1, xx2,yy2,zz2, crossz, with_grid) {
         if (k>=pntbuf.length) console.log('more than 6 points???');

         var part = (crossz - zz1) / (zz2 - zz1), shift = 3;
         if ((lastpart!==0) && (Math.abs(part) < Math.abs(lastpart))) {
            // while second crossing point closer than first to original, move it in memory
            pntbuf[k] = pntbuf[k-3];
            pntbuf[k+1] = pntbuf[k-2];
            pntbuf[k+2] = pntbuf[k-1];
            k-=3; shift = 6;
         }

         pntbuf[k] = xx1 + part*(xx2-xx1);
         pntbuf[k+1] = yy1 + part*(yy2-yy1);
         pntbuf[k+2] = crossz;

         if (with_grid && grid) {
            gridpnts[gridcnt] = pntbuf[k];
            gridpnts[gridcnt+1] = pntbuf[k+1];
            gridpnts[gridcnt+2] = pntbuf[k+2];
            gridcnt+=3;
         }

         k += shift;
         lastpart = part;
      }

      function RememberVertex(indx, ii,jj) {
         var bin = ((ii-handle.i1) * (handle.j2-handle.j1) + (jj-handle.j1))*8;

         if (normindx[bin]>=0)
            return console.error('More than 8 vertexes for the bin');

         var pos = bin+8+normindx[bin]; // position where write index
         normindx[bin]--;
         normindx[pos] = indx; // at this moment index can be overwritten, means all 8 position are there
      }

      function RecalculateNormals(arr) {
         for (var ii=handle.i1;ii<handle.i2;++ii) {
            for (var jj=handle.j1;jj<handle.j2;++jj) {
               var bin = ((ii-handle.i1) * (handle.j2-handle.j1) + (jj-handle.j1)) * 8;

               if (normindx[bin] === -1) continue; // nothing there

               var beg = (normindx[bin] >=0) ? bin : bin+9+normindx[bin],
                   end = bin+8, sumx=0, sumy = 0, sumz = 0;

               for (var kk=beg;kk<end;++kk) {
                  var indx = normindx[kk];
                  if (indx<0) return console.error('FAILURE in NORMALS RECALCULATIONS');
                  sumx+=arr[indx];
                  sumy+=arr[indx+1];
                  sumz+=arr[indx+2];
               }

               sumx = sumx/(end-beg); sumy = sumy/(end-beg); sumz = sumz/(end-beg);

               for (var kk=beg;kk<end;++kk) {
                  var indx = normindx[kk];
                  arr[indx] = sumx;
                  arr[indx+1] = sumy;
                  arr[indx+2] = sumz;
               }
            }
         }
      }

      function AddMainTriangle(x1,y1,z1, x2,y2,z2, x3,y3,z3, is_first) {

         for (var lvl=1;lvl<levels.length;++lvl) {

            var side1 = CheckSide(z1, levels[lvl-1], levels[lvl]),
                side2 = CheckSide(z2, levels[lvl-1], levels[lvl]),
                side3 = CheckSide(z3, levels[lvl-1], levels[lvl]),
                side_sum = side1 + side2 + side3;

            if (side_sum === 3) continue;
            if (side_sum === -3) return;

            if (!loop) {
               var npnts = Math.abs(side2-side1) + Math.abs(side3-side2) + Math.abs(side1-side3);
               if (side1===0) ++npnts;
               if (side2===0) ++npnts;
               if (side3===0) ++npnts;

               if ((npnts===1) || (npnts===2)) console.error('FOND npnts', npnts);

               if (npnts>2) {
                  if (nfaces[lvl]===undefined) nfaces[lvl] = 0;
                  nfaces[lvl] += npnts-2;
               }

               // check if any(contours for given level exists
               if (((side1>0) || (side2>0) || (side3>0)) &&
                   ((side1!==side2) || (side2!==side3) || (side3!==side1))) ++ngridsegments;

               continue;
            }

            gridcnt = 0;

            k = 0;
            if (side1 === 0) { pntbuf[k] = x1; pntbuf[k+1] = y1; pntbuf[k+2] = z1; k+=3; }

            if (side1!==side2) {
               // order is important, should move from 1->2 point, checked via lastpart
               lastpart = 0;
               if ((side1<0) || (side2<0)) AddCrossingPoint(x1,y1,z1, x2,y2,z2, levels[lvl-1]);
               if ((side1>0) || (side2>0)) AddCrossingPoint(x1,y1,z1, x2,y2,z2, levels[lvl], true);
            }

            if (side2 === 0) { pntbuf[k] = x2; pntbuf[k+1] = y2; pntbuf[k+2] = z2; k+=3; }

            if (side2!==side3) {
               // order is important, should move from 2->3 point, checked via lastpart
               lastpart = 0;
               if ((side2<0) || (side3<0)) AddCrossingPoint(x2,y2,z2, x3,y3,z3, levels[lvl-1]);
               if ((side2>0) || (side3>0)) AddCrossingPoint(x2,y2,z2, x3,y3,z3, levels[lvl], true);
            }

            if (side3 === 0) { pntbuf[k] = x3; pntbuf[k+1] = y3; pntbuf[k+2] = z3; k+=3; }

            if (side3!==side1) {
               // order is important, should move from 3->1 point, checked via lastpart
               lastpart = 0;
               if ((side3<0) || (side1<0)) AddCrossingPoint(x3,y3,z3, x1,y1,z1, levels[lvl-1]);
               if ((side3>0) || (side1>0)) AddCrossingPoint(x3,y3,z3, x1,y1,z1, levels[lvl], true);
            }

            if (k===0) continue;
            if (k<9) { console.log('FOND less than 3 points', k/3); continue; }

            if (grid && (gridcnt === 6)) {
               for (var jj=0;jj < 6; ++jj)
                  grid[gindx+jj] = gridpnts[jj];
               gindx+=6;
            }


            // if three points and surf==14, remember vertex for each point

            var buf = pos[lvl], s = indx[lvl];
            if (donormals && (k===9)) {
               RememberVertex(s, i, j);
               RememberVertex(s+3, i+1, is_first ? j+1 : j);
               RememberVertex(s+6, is_first ? i : i+1, j+1);
            }

            for (var k1=3;k1<k-3;k1+=3) {
               buf[s] = pntbuf[0]; buf[s+1] = pntbuf[1]; buf[s+2] = pntbuf[2]; s+=3;
               buf[s] = pntbuf[k1]; buf[s+1] = pntbuf[k1+1]; buf[s+2] = pntbuf[k1+2]; s+=3;
               buf[s] = pntbuf[k1+3]; buf[s+1] = pntbuf[k1+4]; buf[s+2] = pntbuf[k1+5]; s+=3;
            }
            indx[lvl] = s;

         }
      }

      if (donormals) {
         // for each bin maximal 8 points reserved
         normindx = new Int32Array((handle.i2-handle.i1)*(handle.j2-handle.j1)*8);
         for (var n=0;n<normindx.length;++n) normindx[n] = -1;
      }

      for (loop=0;loop<2;++loop) {
         if (loop) {
            for (var lvl=1;lvl<levels.length;++lvl)
               if (nfaces[lvl]) {
                  pos[lvl] = new Float32Array(nfaces[lvl] * 9);
                  indx[lvl] = 0;
               }
            if (dolines && (nsegments > 0))
               lpos = new Float32Array(nsegments * 6);
            if (dogrid && (ngridsegments>0))
               grid = new Float32Array(ngridsegments * 6);
         }
         for (i=handle.i1;i<handle.i2-1;++i) {
            x1 = handle.grx[i];
            x2 = handle.grx[i+1];
            for (j=handle.j1;j<handle.j2-1;++j) {
               y1 = handle.gry[j];
               y2 = handle.gry[j+1];
               z11 = main_grz(histo.getBinContent(i+1, j+1));
               z12 = main_grz(histo.getBinContent(i+1, j+2));
               z21 = main_grz(histo.getBinContent(i+2, j+1));
               z22 = main_grz(histo.getBinContent(i+2, j+2));

               AddMainTriangle(x1,y1,z11, x2,y2,z22, x1,y2,z12, true);

               AddMainTriangle(x1,y1,z11, x2,y1,z21, x2,y2,z22, false);

               AddLineSegment(x1,y2,z12, x1,y1,z11);
               AddLineSegment(x1,y1,z11, x2,y1,z21);

               if (i===handle.i2-2) AddLineSegment(x2,y1,z21, x2,y2,z22);
               if (j===handle.j2-2) AddLineSegment(x1,y2,z12, x2,y2,z22);
            }
         }
      }

      // console.log('lpos', lpos.length, 'lindx', lindx);

      for (var lvl=1;lvl<levels.length;++lvl)
         if (pos[lvl]) {
            if (indx[lvl] !== nfaces[lvl]*9)
                 console.error('SURF faces missmatch lvl', lvl, 'faces', nfaces[lvl], 'index', indx[lvl], 'check', nfaces[lvl]*9 - indx[lvl]);
            var geometry = new THREE.BufferGeometry();
            geometry.addAttribute( 'position', new THREE.BufferAttribute( pos[lvl], 3 ) );
            geometry.computeVertexNormals();
            if (donormals && (lvl===1)) RecalculateNormals(geometry.getAttribute('normal').array);


            var fcolor, material;
            if (docolorfaces) {
               fcolor = this.getIndexColor(lvl);
            } else {
               fcolor = histo.fFillColor > 1 ? JSROOT.Painter.root_colors[histo.fFillColor] : 'white';
               if ((this.options.Surf === 14) && (histo.fFillColor<2)) fcolor = JSROOT.Painter.root_colors[48];
            }
            if (this.options.Surf === 14)
               material = new THREE.MeshLambertMaterial( { color: fcolor, side: THREE.DoubleSide  } );
            else
               material = new THREE.MeshBasicMaterial( { color: fcolor, side: THREE.DoubleSide  } );

            this.toplevel.add(new THREE.Mesh(geometry, material));
         }


      if (lpos) {
         if (nsegments*6 !== lindx)
            console.error('SURF lines mismmatch nsegm', nsegments, ' lindx', lindx, 'difference', nsegments*6 - lindx);

         var geometry = new THREE.BufferGeometry();
         geometry.addAttribute( 'position', new THREE.BufferAttribute( lpos, 3 ) );
         var lcolor = JSROOT.Painter.root_colors[histo.fLineColor];

         var material = new THREE.LineBasicMaterial({ color: new THREE.Color(lcolor) });
         if (!JSROOT.browser.isIE) material.linewidth = histo.fLineWidth;
         var line = new THREE.LineSegments(geometry, material);
         this.toplevel.add(line);
      }

      if (grid) {
         if (ngridsegments*6 !== gindx)
            console.error('SURF grid draw mismatch ngridsegm', ngridsegments, 'gindx', gindx, 'diff', ngridsegments*6 - gindx);

         var geometry = new THREE.BufferGeometry();
         geometry.addAttribute( 'position', new THREE.BufferAttribute( grid, 3 ) );

         var material;

         if (this.options.Surf === 1)
            material = new THREE.LineDashedMaterial( { color: 0x0, dashSize: 2, gapSize: 2  } );
         else
            material = new THREE.LineBasicMaterial({ color: new THREE.Color(JSROOT.Painter.root_colors[histo.fLineColor]) });

         var line = new THREE.LineSegments(geometry, material);
         this.toplevel.add(line);
      }
   }

   JSROOT.Painter.HistPainter_DrawPolyLego = function() {

      var histo = this.GetObject(),
          pmain = this.main_painter(),
          axis_zmin = this.grz.domain()[0],
          axis_zmax = this.grz.domain()[1],
          colindx, bin, i, len = histo.fBins.arr.length, cnt = 0, totalnfaces = 0,
          z0 = this.grz(axis_zmin), z1 = z0;

      // force recalculations of contours
      this.fContour = null;
      this.fCustomContour = false;

      // use global coordinates
      this.maxbin = this.gmaxbin;
      this.minbin = this.gminbin;

      for (i = 0; i < len; ++ i) {
         bin = histo.fBins.arr[i];
         if (bin.fContent < axis_zmin) continue;

         colindx = this.getValueColor(bin.fContent, true);
         if (colindx === null) continue;

         // check if bin outside visible range
         if ((bin.fXmin > pmain.scale_xmax) || (bin.fXmax < pmain.scale_xmin) ||
             (bin.fYmin > pmain.scale_ymax) || (bin.fYmax < pmain.scale_ymin)) continue;

         z1 = this.grz(bin.fContent > axis_zmax ? axis_zmax : bin.fContent);

         var all_pnts = [], all_faces = [],
             ngraphs = 1, gr = bin.fPoly, nfaces = 0;

         if (gr._typename=='TMultiGraph') {
            ngraphs = bin.fPoly.fGraphs.arr.length;
            gr = null;
         }

         for (var ngr = 0; ngr < ngraphs; ++ngr) {
            if (!gr || (ngr>0)) gr = bin.fPoly.fGraphs.arr[ngr];

            var npnts = gr.fNpoints, x = gr.fX, y = gr.fY;
            while ((npnts>2) && (x[0]===x[npnts-1]) && (y[0]===y[npnts-1])) --npnts;

            var pnts, faces;

            for (var ntry=0;ntry<2;++ntry) {
               // run two loops - on the first try to compress data, on second - run as is (removing duplication)

               var lastx, lasty, currx, curry,
                   dist2 = this.size3d*this.size3d,
                   dist2limit = (ntry>0) ? 0 : dist2/1e6;

               pnts = []; faces = null;

               for (var vert = 0; vert < npnts; ++vert) {
                  currx = this.grx(x[vert]);
                  curry = this.gry(y[vert]);
                  if (vert>0)
                     dist2 = (currx-lastx)*(currx-lastx) + (curry-lasty)*(curry-lasty);
                  if (dist2 > dist2limit) {
                     pnts.push(new THREE.Vector2(currx, curry));
                     lastx = currx;
                     lasty = curry;
                  }
               }

               try {
                  if (pnts.length > 2)
                     faces = THREE.ShapeUtils.triangulateShape(pnts , []);
               } catch(e) {
                  faces = null;
               }

               if (faces && (faces.length>pnts.length-3)) break;

               // console.log('Triangulation problem with bin', i, bin.fPoly.fName, 'ngr', ngr, ' npoints', pnts.length, 'orig', gr.fNpoints);
            }

            if (faces && faces.length && pnts) {
               all_pnts.push(pnts);
               all_faces.push(faces);

               nfaces += faces.length * 2;
               if (z1>z0) nfaces += pnts.length*2;
            }
         }

         var pos = new Float32Array(nfaces*9), indx = 0;

         for (var ngr=0;ngr<all_pnts.length;++ngr) {
            var pnts = all_pnts[ngr], faces = all_faces[ngr];

            for (var layer=0;layer<2;++layer) {
               for (var n=0;n<faces.length;++n) {
                  var face = faces[n],
                      pnt1 = pnts[face[0]],
                      pnt2 = pnts[face[(layer===0) ? 2 : 1]],
                      pnt3 = pnts[face[(layer===0) ? 1 : 2]];

                  pos[indx] = pnt1.x;
                  pos[indx+1] = pnt1.y;
                  pos[indx+2] = layer ? z1 : z0;
                  indx+=3;

                  pos[indx] = pnt2.x;
                  pos[indx+1] = pnt2.y;
                  pos[indx+2] = layer ? z1 : z0;
                  indx+=3;

                  pos[indx] = pnt3.x;
                  pos[indx+1] = pnt3.y;
                  pos[indx+2] = layer ? z1 : z0;
                  indx+=3;
               }
            }

            if (z1>z0) {
               for (var n=0;n<pnts.length;++n) {
                  var pnt1 = pnts[n],
                      pnt2 = pnts[(n>0) ? n-1 : pnts.length-1];

                  pos[indx] = pnt1.x;
                  pos[indx+1] = pnt1.y;
                  pos[indx+2] = z0;
                  indx+=3;

                  pos[indx] = pnt2.x;
                  pos[indx+1] = pnt2.y;
                  pos[indx+2] = z0;
                  indx+=3;

                  pos[indx] = pnt2.x;
                  pos[indx+1] = pnt2.y;
                  pos[indx+2] = z1;
                  indx+=3;

                  pos[indx] = pnt1.x;
                  pos[indx+1] = pnt1.y;
                  pos[indx+2] = z0;
                  indx+=3;

                  pos[indx] = pnt2.x;
                  pos[indx+1] = pnt2.y;
                  pos[indx+2] = z1;
                  indx+=3;

                  pos[indx] = pnt1.x;
                  pos[indx+1] = pnt1.y;
                  pos[indx+2] = z1;
                  indx+=3;
               }
            }
         }

         // console.log('creating bin', i,'nfaces', nfaces, 'indx', indx);

         var geometry = new THREE.BufferGeometry();
         geometry.addAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
         geometry.computeVertexNormals();

         var fcolor = this.fPalette[colindx];
         var material = new THREE.MeshBasicMaterial( { color: fcolor, shading: THREE.SmoothShading  } );
         var mesh = new THREE.Mesh(geometry, material);

         this.toplevel.add(mesh);

         mesh.painter = this;
         mesh.bins_index = i;
         mesh.draw_z0 = z0;
         mesh.draw_z1 = z1;
         mesh.tip_color = 0x00FF00;

         mesh.tooltip = function(intersects) {

            var p = this. painter,
                bin = p.GetObject().fBins.arr[this.bins_index];

            var tip = {
              use_itself: true, // indicate that use mesh itself for highlighting
              x1: p.grx(bin.fXmin),
              x2: p.grx(bin.fXmax),
              y1: p.gry(bin.fYmin),
              y2: p.gry(bin.fYmax),
              z1: this.draw_z0,
              z2: this.draw_z1,
              bin: this.bins_index,
              value: bin.fContent,
              color: this.tip_color,
              info: p.ProvidePolyBinHints(this.bins_index)
            };

            return tip;
         };

         totalnfaces += nfaces;
         cnt++;
      }
   }

   JSROOT.Painter.IsRender3DFired = function(painter) {
      if (!painter || painter.renderer === undefined) return false;

      return painter.render_tmout !== undefined; // when timeout configured, object is prepared for rendering
   }

   JSROOT.Painter.Render3D = function(tmout) {
      if (tmout === undefined) tmout = 5; // by default, rendering happens with timeout

      if (tmout <= 0) {
         if ('render_tmout' in this)
            clearTimeout(this.render_tmout);

         if (this.renderer === undefined) return;

         var tm1 = new Date();

         if (typeof this.TestAxisVisibility === 'function')
            this.TestAxisVisibility(this.camera, this.toplevel, this.options.FrontBox, this.options.BackBox);

         // do rendering, most consuming time
         this.renderer.render(this.scene, this.camera);

         var tm2 = new Date();

         delete this.render_tmout;

         if (this.first_render_tm === 0) {
            this.first_render_tm = tm2.getTime() - tm1.getTime();
            this.enable_hightlight = this.first_render_tm < 1200;
            console.log('First render tm = ' + this.first_render_tm);
         }

         return;
      }

      // no need to shoot rendering once again
      if ('render_tmout' in this) return;

      this.render_tmout = setTimeout(this.Render3D.bind(this,0), tmout);
   }

   JSROOT.Painter.Resize3D = function() {

      var size3d = this.size_for_3d(this.access_3d_kind());

      this.apply_3d_size(size3d);

      if ((this.scene_width === size3d.width) && (this.scene_height === size3d.height)) return false;

      if ((size3d.width<10) || (size3d.height<10)) return false;

      this.scene_width = size3d.width;
      this.scene_height = size3d.height;

      this.camera.aspect = this.scene_width / this.scene_height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize( this.scene_width, this.scene_height );

      return true;
   }

   JSROOT.Painter.TH1Painter_Draw3D = function(call_back, resize) {
      // function called with this as painter

      if (resize)  {

         if (this.Resize3D()) this.Render3D();

      } else {

         this.Create3DScene();
         this.Draw3DBins = JSROOT.Painter.HistPainter_DrawLego;

         this.DeleteAtt();

         this.DrawXYZ(this.toplevel, { use_y_for_z: true, zmult: 1.1, zoom: JSROOT.gStyle.Zooming });

         this.Draw3DBins();

         this.Render3D();

         this.AddKeysHandler();
      }

      // (re)draw palette by resize while canvas may change dimension
      this.DrawColorPalette((this.options.Zscale > 0) && ((this.options.Lego===12) || (this.options.Lego===14)));

      this.DrawTitle();

      JSROOT.CallBack(call_back);
   }


   JSROOT.Painter.TH2Painter_Draw3D = function(call_back, resize) {
      // function called with this as painter

      if (resize) {

         if (this.Resize3D()) this.Render3D();

      } else {

         this.Create3DScene();
         this.Draw3DBins = JSROOT.Painter.HistPainter_DrawLego;

         var pad = this.root_pad();
         // if (pad && pad.fGridz === undefined) pad.fGridz = false;

         this.zmin = pad.fLogz ? this.gmin0bin * 0.3 : this.gminbin;
         this.zmax = this.gmaxbin;

         if (this.histo.fMinimum !== -1111) this.zmin = this.histo.fMinimum;
         if (this.histo.fMaximum !== -1111) this.zmax = this.histo.fMaximum;

         if (pad.fLogz && (this.zmin<=0)) this.zmin = this.zmax * 1e-5;

         this.DeleteAtt();

         this.DrawXYZ(this.toplevel, { use_y_for_z: false, zmult: 1.1, zoom: JSROOT.gStyle.Zooming });

         this.Draw3DBins();

         this.Render3D();

         this.AddKeysHandler();
      }

      // (re)draw palette by resize while canvas may change dimension
      this.DrawColorPalette((this.options.Zscale > 0) && ((this.options.Lego===12) || (this.options.Lego===14) ||
                             (this.options.Surf===11) || (this.options.Surf===12)));

      this.DrawTitle();

      JSROOT.CallBack(call_back);
   }

   // ==============================================================================


   JSROOT.TH3Painter = function(histo) {
      JSROOT.THistPainter.call(this, histo);

      this.Create3DScene = JSROOT.Painter.HPainter_Create3DScene;

      this.mode3d = true;
   }

   JSROOT.TH3Painter.prototype = Object.create(JSROOT.THistPainter.prototype);

   JSROOT.TH3Painter.prototype.ScanContent = function() {
      var histo = this.GetObject();

      this.nbinsx = histo.fXaxis.fNbins;
      this.nbinsy = histo.fYaxis.fNbins;
      this.nbinsz = histo.fZaxis.fNbins;

      this.xmin = histo.fXaxis.fXmin;
      this.xmax = histo.fXaxis.fXmax;

      this.ymin = histo.fYaxis.fXmin;
      this.ymax = histo.fYaxis.fXmax;

      this.zmin = histo.fZaxis.fXmin;
      this.zmax = histo.fZaxis.fXmax;

      // global min/max, used at the moment in 3D drawing

      this.gminbin = this.gmaxbin = histo.getBinContent(1,1,1);
      var i,j,k;
      for (i = 0; i < this.nbinsx; ++i)
         for (j = 0; j < this.nbinsy; ++j)
            for (k = 0; k < this.nbinsz; ++k) {
               var bin_content = histo.getBinContent(i+1, j+1, k+1);
               if (bin_content < this.gminbin) this.gminbin = bin_content; else
               if (bin_content > this.gmaxbin) this.gmaxbin = bin_content;
            }

      this.draw_content = this.gmaxbin > 0;

      this.CreateAxisFuncs(true, true);
   }

   JSROOT.TH3Painter.prototype.CountStat = function() {
      var histo = this.GetObject(),
          stat_sum0 = 0, stat_sumx1 = 0, stat_sumy1 = 0,
          stat_sumz1 = 0, stat_sumx2 = 0, stat_sumy2 = 0, stat_sumz2 = 0,
          i1 = this.GetSelectIndex("x", "left"),
          i2 = this.GetSelectIndex("x", "right"),
          j1 = this.GetSelectIndex("y", "left"),
          j2 = this.GetSelectIndex("y", "right"),
          k1 = this.GetSelectIndex("z", "left"),
          k2 = this.GetSelectIndex("z", "right"),
          res = { entries: 0, integral: 0, meanx: 0, meany: 0, meanz: 0, rmsx: 0, rmsy: 0, rmsz: 0 };

      for (var xi = 0; xi < this.nbinsx+2; ++xi) {

         var xx = this.GetBinX(xi - 0.5);
         var xside = (xi < i1) ? 0 : (xi > i2 ? 2 : 1);

         for (var yi = 0; yi < this.nbinsy+2; ++yi) {

            var yy = this.GetBinY(yi - 0.5);
            var yside = (yi < j1) ? 0 : (yi > j2 ? 2 : 1);

            for (var zi = 0; zi < this.nbinsz+2; ++zi) {

               var zz = this.GetBinZ(zi - 0.5);
               var zside = (zi < k1) ? 0 : (zi > k2 ? 2 : 1);

               var cont = histo.getBinContent(xi, yi, zi);
               res.entries += cont;

               if ((xside==1) && (yside==1) && (zside==1)) {
                  stat_sum0 += cont;
                  stat_sumx1 += xx * cont;
                  stat_sumy1 += yy * cont;
                  stat_sumz1 += zz * cont;
                  stat_sumx2 += xx * xx * cont;
                  stat_sumy2 += yy * yy * cont;
                  stat_sumz2 += zz * zz * cont;
               }
            }
         }
      }

      if ((histo.fTsumw > 0) && !this.IsAxisZoomed("x") && !this.IsAxisZoomed("y") && !this.IsAxisZoomed("z")) {
         stat_sum0  = histo.fTsumw;
         stat_sumx1 = histo.fTsumwx;
         stat_sumx2 = histo.fTsumwx2;
         stat_sumy1 = histo.fTsumwy;
         stat_sumy2 = histo.fTsumwy2;
         stat_sumz1 = histo.fTsumwz;
         stat_sumz2 = histo.fTsumwz2;
      }

      if (stat_sum0 > 0) {
         res.meanx = stat_sumx1 / stat_sum0;
         res.meany = stat_sumy1 / stat_sum0;
         res.meanz = stat_sumz1 / stat_sum0;
         res.rmsx = Math.sqrt(Math.max(0, stat_sumx2 / stat_sum0 - res.meanx * res.meanx));
         res.rmsy = Math.sqrt(Math.max(0, stat_sumy2 / stat_sum0 - res.meany * res.meany));
         res.rmsz = Math.sqrt(Math.max(0, stat_sumz2 / stat_sum0 - res.meanz * res.meanz));
      }

      res.integral = stat_sum0;

      if (histo.fEntries > 1) res.entries = histo.fEntries;

      return res;
   }

   JSROOT.TH3Painter.prototype.FillStatistic = function(stat, dostat, dofit) {
      if (this.GetObject()===null) return false;

      var pave = stat.GetObject(),
          data = this.CountStat(),
          print_name = dostat % 10,
          print_entries = Math.floor(dostat / 10) % 10,
          print_mean = Math.floor(dostat / 100) % 10,
          print_rms = Math.floor(dostat / 1000) % 10,
          print_under = Math.floor(dostat / 10000) % 10,
          print_over = Math.floor(dostat / 100000) % 10,
          print_integral = Math.floor(dostat / 1000000) % 10;
      //var print_skew = Math.floor(dostat / 10000000) % 10;
      //var print_kurt = Math.floor(dostat / 100000000) % 10;

      if (print_name > 0)
         pave.AddText(this.GetObject().fName);

      if (print_entries > 0)
         pave.AddText("Entries = " + stat.Format(data.entries,"entries"));

      if (print_mean > 0) {
         pave.AddText("Mean x = " + stat.Format(data.meanx));
         pave.AddText("Mean y = " + stat.Format(data.meany));
         pave.AddText("Mean z = " + stat.Format(data.meanz));
      }

      if (print_rms > 0) {
         pave.AddText("Std Dev x = " + stat.Format(data.rmsx));
         pave.AddText("Std Dev y = " + stat.Format(data.rmsy));
         pave.AddText("Std Dev z = " + stat.Format(data.rmsz));
      }

      if (print_integral > 0) {
         pave.AddText("Integral = " + stat.Format(data.integral,"entries"));
      }

      // adjust the size of the stats box with the number of lines

      var nlines = pave.fLines.arr.length,
          stath = nlines * JSROOT.gStyle.StatFontSize;
      if (stath <= 0 || 3 == (JSROOT.gStyle.StatFont % 10)) {
         stath = 0.25 * nlines * JSROOT.gStyle.StatH;
         pave.fY1NDC = 0.93 - stath;
         pave.fY2NDC = 0.93;
      }

      return true;
   }

   JSROOT.TH3Painter.prototype.GetBinTips = function (ix, iy, iz) {
      var lines = [];
      lines.push(this.GetTipName());
      lines.push('x=' + JSROOT.FFormat(this.GetBinX(ix+0.5),"6.4g") + ' bin=' + (ix+1));
      lines.push('y=' + JSROOT.FFormat(this.GetBinY(iy+0.5),"6.4g") + ' bin=' + (iy+1));
      lines.push('z=' + JSROOT.FFormat(this.GetBinZ(iz+0.5),"6.4g") + ' bin=' + (iz+1));
      lines.push('entries=' + JSROOT.FFormat(this.GetObject().getBinContent(ix+1, iy+1, iz+1), "7.0g"));
      return lines;
   }

   JSROOT.TH3Painter.prototype.Draw3DBins = function() {

      if (!this.draw_content) return;

      var rootcolor = this.GetObject().fFillColor,
          fillcolor = JSROOT.Painter.root_colors[rootcolor],
          material = null, buffer_size = 0, helper = null, helper_kind = 0,
          single_bin_verts, single_bin_norms;


      if (this.options.Box === 11) {
         // material = new THREE.MeshPhongMaterial({ color : fillcolor /*, specular : 0x4f4f4f */ });
         // material = new THREE.MeshBasicMaterial( { color: fillcolor, shading: THREE.SmoothShading  } );
         material = new THREE.MeshLambertMaterial({ color : fillcolor });

         var geom = JSROOT.Painter.TestWebGL() ? new THREE.SphereGeometry(0.5, 16, 12) : new THREE.SphereGeometry(0.5, 8, 6);
         geom.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );

         buffer_size = geom.faces.length*9;
         single_bin_verts = new Float32Array(buffer_size);
         single_bin_norms = new Float32Array(buffer_size);

         // Fill a typed array with cube geometry that will be shared by all
         // (This technically could be put into an InstancedBufferGeometry but
         // performance gain is likely not huge )
         for (var face = 0; face < geom.faces.length; ++face) {
            single_bin_verts[9*face  ] = geom.vertices[geom.faces[face].a].x;
            single_bin_verts[9*face+1] = geom.vertices[geom.faces[face].a].y;
            single_bin_verts[9*face+2] = geom.vertices[geom.faces[face].a].z;
            single_bin_verts[9*face+3] = geom.vertices[geom.faces[face].b].x;
            single_bin_verts[9*face+4] = geom.vertices[geom.faces[face].b].y;
            single_bin_verts[9*face+5] = geom.vertices[geom.faces[face].b].z;
            single_bin_verts[9*face+6] = geom.vertices[geom.faces[face].c].x;
            single_bin_verts[9*face+7] = geom.vertices[geom.faces[face].c].y;
            single_bin_verts[9*face+8] = geom.vertices[geom.faces[face].c].z;

            single_bin_norms[9*face  ] = geom.faces[face].vertexNormals[0].x;
            single_bin_norms[9*face+1] = geom.faces[face].vertexNormals[0].y;
            single_bin_norms[9*face+2] = geom.faces[face].vertexNormals[0].z;
            single_bin_norms[9*face+3] = geom.faces[face].vertexNormals[1].x;
            single_bin_norms[9*face+4] = geom.faces[face].vertexNormals[1].y;
            single_bin_norms[9*face+5] = geom.faces[face].vertexNormals[1].z;
            single_bin_norms[9*face+6] = geom.faces[face].vertexNormals[2].x;
            single_bin_norms[9*face+7] = geom.faces[face].vertexNormals[2].y;
            single_bin_norms[9*face+8] = geom.faces[face].vertexNormals[2].z;
         }

      } else {
         // material = new THREE.MeshLambertMaterial({ color : fillcolor });

         material = new THREE.MeshBasicMaterial( { color: fillcolor  } );

         var indicies = JSROOT.Painter.Box_Indexes,
             normals = JSROOT.Painter.Box_Normals,
             vertices = JSROOT.Painter.Box_Vertices;

         buffer_size = indicies.length*3;
         single_bin_verts = new Float32Array(buffer_size);
         single_bin_norms = new Float32Array(buffer_size);

         for (var k=0,nn=-3;k<indicies.length;++k) {
            var vert = vertices[indicies[k]];
            single_bin_verts[k*3]   = vert.x-0.5;
            single_bin_verts[k*3+1] = vert.y-0.5;
            single_bin_verts[k*3+2] = vert.z-0.5;

            if (k%6===0) nn+=3;
            single_bin_norms[k*3]   = normals[nn];
            single_bin_norms[k*3+1] = normals[nn+1];
            single_bin_norms[k*3+2] = normals[nn+2];
         }

         helper_kind = 1; // use same vertices to create helper, one can use maximal 64K vertices

         // geom = new THREE.BoxGeometry(1, 1, 1);
         // helper = new THREE.BoxHelper(new THREE.Mesh(geom));
      }

      var histo = this.GetObject(),
          i1 = this.GetSelectIndex("x", "left", 0.5),
          i2 = this.GetSelectIndex("x", "right", 0),
          j1 = this.GetSelectIndex("y", "left", 0.5),
          j2 = this.GetSelectIndex("y", "right", 0),
          k1 = this.GetSelectIndex("z", "left", 0.5),
          k2 = this.GetSelectIndex("z", "right", 0),
          name = this.GetTipName("<br/>");

      var scalex = (this.grx(this.GetBinX(i2+0.5)) - this.grx(this.GetBinX(i1+0.5))) / (i2-i1),
          scaley = (this.gry(this.GetBinY(j2+0.5)) - this.gry(this.GetBinY(j1+0.5))) / (j2-j1),
          scalez = (this.grz(this.GetBinZ(k2+0.5)) - this.grz(this.GetBinZ(k1+0.5))) / (k2-k1);

      var nbins = 0, i, j, k, wei, bin_content;

      for (i = i1; i < i2; ++i) {
         for (j = j1; j < j2; ++j) {
            for (k = k1; k < k2; ++k) {
               bin_content = histo.getBinContent(i+1, j+1, k+1);
               if (bin_content <= this.gminbin) continue;
               wei = (this.options.Color > 0) ? 1. : bin_content / this.gmaxbin;
               if (wei < 1e-5) continue; // do not empty or very small bins

               nbins++;
            }
         }
      }

      // console.log("Create buffer for", nbins, 'bins fullsize', nbins * buffer_size);

      if ((helper_kind === 1) && (nbins * buffer_size / 3 > 0xFFF0)) helper_kind = 2;

      var bin_verts = new Float32Array(nbins * buffer_size),
          bin_norms = new Float32Array(nbins * buffer_size),
          bin_tooltips = new Int32Array(nbins),
          helper_segments,
          helper_indexes,    // helper_kind == 1, use original vertices
          helper_positions;  // helper_kind == 2, all vertices copied into separate buffer

      if (helper_kind===1) {
         helper_segments = JSROOT.Painter.Box_MeshSegments;
         helper_indexes = new Uint16Array(nbins * helper_segments.length);
      }

      if (helper_kind===2) {
         helper_segments = JSROOT.Painter.Box_Segments;
         helper_positions = new Float32Array(nbins * helper_segments.length * 3);
      }

      var binx, grx, biny, gry, binz, grz;

      nbins = 0;

      for (i = i1; i < i2; ++i) {
         binx = this.GetBinX(i+0.5); grx = this.grx(binx);
         for (j = j1; j < j2; ++j) {
            biny = this.GetBinY(j+0.5); gry = this.gry(biny);
            for (k = k1; k < k2; ++k) {
               bin_content = histo.getBinContent(i+1, j+1, k+1);
               if (bin_content <= this.gminbin) continue;

               wei = /*(this.options.Color > 0) ? 1. :*/  bin_content / this.gmaxbin;
               if (wei < 1e-5) continue; // do not show empty bins

               binz = this.GetBinZ(k+0.5); grz = this.grz(binz);

               // remeber bin index for tooltip
               bin_tooltips[nbins] = histo.getBin(i+1, j+1, k+1);

               var vvv = nbins * buffer_size;

               // Grab the coordinates and scale that are being assigned to each bin
               for (var vi = 0; vi < buffer_size; vi+=3, vvv+=3) {
                  bin_verts[vvv]   = grx + single_bin_verts[vi]*scalex*wei;
                  bin_verts[vvv+1] = gry + single_bin_verts[vi+1]*scaley*wei;
                  bin_verts[vvv+2] = grz + single_bin_verts[vi+2]*scalez*wei;

                  bin_norms[vvv]   = single_bin_norms[vi];
                  bin_norms[vvv+1] = single_bin_norms[vi+1];
                  bin_norms[vvv+2] = single_bin_norms[vi+2];
               }


               if (helper_kind===1) {
                  // reuse vertices created for the mesh
                  vvv = nbins * helper_segments.length;
                  var shift = Math.round(nbins * buffer_size/3);
                  for (var n=0;n<helper_segments.length;++n)
                     helper_indexes[vvv+n] = shift + helper_segments[n];
               }

               if (helper_kind===2) {
                  vvv = nbins * helper_segments.length * 3;
                  for (var n=0;n<helper_segments.length;++n, vvv+=3) {
                     var vert = JSROOT.Painter.Box_Vertices[helper_segments[n]];
                     helper_positions[vvv]   = grx + (vert.x-0.5)*scalex*wei;
                     helper_positions[vvv+1] = gry + (vert.y-0.5)*scaley*wei;
                     helper_positions[vvv+2] = grz + (vert.z-0.5)*scalez*wei;
                  }
               }

               nbins++;
            }
         }
      }

      // BufferGeometries that store geometry of all bins
      var all_bins_buffgeom = new THREE.BufferGeometry();

      // Create mesh from bin buffergeometry
      all_bins_buffgeom.addAttribute('position', new THREE.BufferAttribute( bin_verts, 3 ) );
      all_bins_buffgeom.addAttribute('normal', new THREE.BufferAttribute( bin_norms, 3 ) );

      var combined_bins = new THREE.Mesh(all_bins_buffgeom, material);

      combined_bins.bins = bin_tooltips;
      combined_bins.bins_faces = buffer_size/3;
      combined_bins.painter = this;

      var tipscale = (this.options.Box === 11) ? 0.4 : 0.5;

      combined_bins.scalex = tipscale*scalex;
      combined_bins.scaley = tipscale*scaley;
      combined_bins.scalez = tipscale*scalez;
      combined_bins.tip_color = (rootcolor===3) ? 0xFF0000 : 0x00FF00;

      combined_bins.tooltip = function(intersect) {
         var indx = Math.floor(intersect.index / this.bins_faces);
         if ((indx<0) || (indx >= this.bins.length)) return null;

         var p = this.painter,
             tip = p.Get3DToolTip(this.bins[indx]);

         grx = p.grx(p.GetBinX(tip.ix-0.5));
         gry = p.gry(p.GetBinY(tip.iy-0.5));
         grz = p.grz(p.GetBinZ(tip.iz-0.5));

         wei = tip.value / p.gmaxbin;

         tip.x1 = grx - this.scalex*wei; tip.x2 = grx + this.scalex*wei;
         tip.y1 = gry - this.scaley*wei; tip.y2 = gry + this.scaley*wei;
         tip.z1 = grz - this.scalez*wei; tip.z2 = grz + this.scalez*wei;

         tip.color = this.tip_color;

         return tip;
      }

      this.toplevel.add(combined_bins);

      if (helper_kind > 0) {
         var helper_geom = new THREE.BufferGeometry();

         if (helper_kind === 1) {
            // reuse positions from the mesh - only special index was created
            helper_geom.setIndex(  new THREE.BufferAttribute(helper_indexes, 1) );
            helper_geom.addAttribute( 'position', new THREE.BufferAttribute( bin_verts, 3 ) );
         } else {
            helper_geom.addAttribute( 'position', new THREE.BufferAttribute( helper_positions, 3 ) );
         }

         var helper_material = new THREE.LineBasicMaterial( { color: 0x000000 } );

         var lines = new THREE.LineSegments(helper_geom, helper_material );

         this.toplevel.add(lines);

         //lines.bins = bins;
         //lines.bins_faces = helper_single_indexes.length;
         //lines.painter = this;
         //lines.tooltip = combined_bins.tooltip;
      }
   }

   JSROOT.TH3Painter.prototype.Redraw = function(resize) {
      if (resize) {

         if (this.Resize3D()) this.Render3D();

      } else {

         this.Create3DScene();
         this.DrawXYZ(this.toplevel, { zoom: JSROOT.gStyle.Zooming });
         this.Draw3DBins();
         this.Render3D();
         this.AddKeysHandler();

      }
      this.DrawTitle();
   }

   JSROOT.TH3Painter.prototype.FillToolbar = function() {
      var pp = this.pad_painter(true);
      if (pp===null) return;

      pp.AddButton(JSROOT.ToolbarIcons.auto_zoom, 'Unzoom all axes', 'ToggleZoom', "Ctrl *");
      if (this.draw_content)
         pp.AddButton(JSROOT.ToolbarIcons.statbox, 'Toggle stat box', "ToggleStatBox");
   }

   JSROOT.TH3Painter.prototype.CanZoomIn = function(axis,min,max) {
      // check if it makes sense to zoom inside specified axis range

      if ((axis=="x") && (this.GetIndexX(max,0.5) - this.GetIndexX(min,0) > 1)) return true;

      if ((axis=="y") && (this.GetIndexY(max,0.5) - this.GetIndexY(min,0) > 1)) return true;

      if ((axis=="z") && (this.GetIndexZ(max,0.5) - this.GetIndexZ(min,0) > 1)) return true;

      return false;
   }

   JSROOT.TH3Painter.prototype.AutoZoom = function() {
      var i1 = this.GetSelectIndex("x", "left"),
          i2 = this.GetSelectIndex("x", "right"),
          j1 = this.GetSelectIndex("y", "left"),
          j2 = this.GetSelectIndex("y", "right"),
          k1 = this.GetSelectIndex("z", "left"),
          k2 = this.GetSelectIndex("z", "right"),
          i,j,k, histo = this.GetObject();

      if ((i1 === i2) || (j1 === j2) || (k1 === k2)) return;

      // first find minimum
      var min = histo.getBinContent(i1 + 1, j1 + 1, k1+1);
      for (i = i1; i < i2; ++i)
         for (j = j1; j < j2; ++j)
            for (k = k1; k < k2; ++k)
               min = Math.min(min, histo.getBinContent(i+1, j+1, k+1));

      if (min>0) return; // if all points positive, no chance for autoscale

      var ileft = i2, iright = i1, jleft = j2, jright = j1, kleft = k2, kright = k1;

      for (i = i1; i < i2; ++i)
         for (j = j1; j < j2; ++j)
            for (k = k1; k < k2; ++k)
               if (histo.getBinContent(i+1, j+1, k+1) > min) {
                  if (i < ileft) ileft = i;
                  if (i >= iright) iright = i + 1;
                  if (j < jleft) jleft = j;
                  if (j >= jright) jright = j + 1;
                  if (k < kleft) kleft = k;
                  if (k >= kright) kright = k + 1;
               }

      var xmin, xmax, ymin, ymax, zmin, zmax, isany = false;

      if ((ileft === iright-1) && (ileft > i1+1) && (iright < i2-1)) { ileft--; iright++; }
      if ((jleft === jright-1) && (jleft > j1+1) && (jright < j2-1)) { jleft--; jright++; }
      if ((kleft === kright-1) && (kleft > k1+1) && (kright < k2-1)) { kleft--; kright++; }

      if ((ileft > i1 || iright < i2) && (ileft < iright - 1)) {
         xmin = this.GetBinX(ileft);
         xmax = this.GetBinX(iright);
         isany = true;
      }

      if ((jleft > j1 || jright < j2) && (jleft < jright - 1)) {
         ymin = this.GetBinY(jleft);
         ymax = this.GetBinY(jright);
         isany = true;
      }

      if ((kleft > k1 || kright < k2) && (kleft < kright - 1)) {
         zmin = this.GetBinZ(kleft);
         zmax = this.GetBinZ(kright);
         isany = true;
      }

      if (isany) this.Zoom(xmin, xmax, ymin, ymax, zmin, zmax);
   }


   JSROOT.TH3Painter.prototype.FillHistContextMenu = function(menu) {
      menu.addDrawMenu("Draw with", ["box", "box1", "inspect"], function(arg) {
         if (arg==='inspect')
            return JSROOT.draw(this.divid, this.GetObject(),arg);

         this.options = this.DecodeOptions(arg);
         this.Redraw();
      });
   }

   JSROOT.Painter.drawHistogram3D = function(divid, histo, opt) {
      // when called, *this* set to painter instance

      // create painter and add it to canvas
      JSROOT.extend(this, new JSROOT.TH3Painter(histo));

      this.SetDivId(divid, 4);

      this.options = this.DecodeOptions(opt);

      this.CheckPadRange();

      this.ScanContent();

      this.Redraw();

      if (JSROOT.gStyle.AutoStat && this.create_canvas) {
         var stats = this.CreateStat();
         if (stats) JSROOT.draw(this.divid, stats, "");
      }

      this.FillToolbar();

      return this.DrawingReady();
   }

   // ===================================================================

   JSROOT.Painter.drawPolyMarker3D = function(divid, poly, opt) {
      // when called, *this* set to painter instance

      this.SetDivId(divid);

      var main = this.main_painter();

      if (!main  || !('renderer' in main)) return this.DrawingReady();

      var step = 3, use_points = main.webgl /*&& !JSROOT.browser.isWin*/,
          sizelimit = main.webgl ? 50000 : 5000;

      if ((JSROOT.gStyle.OptimizeDraw > 0) && !use_points && (poly.fP.length > 3*sizelimit)) {
         step = Math.floor(poly.fP.length / sizelimit / 3 ) * 3;
         if (step <= 6) step = 6;
      }

      var size = Math.floor(poly.fP.length/step),
          indicies = JSROOT.Painter.Box_Indexes,
          normals = JSROOT.Painter.Box_Normals,
          vertices = JSROOT.Painter.Box_Vertices,
          lll = 0, scale = main.size3d/100, pos, norm;

      if (use_points) {
         pos = new Float32Array(size*3);
         norm = null;
      } else {
         pos = new Float32Array(indicies.length*3*size);
         norm = new Float32Array(indicies.length*3*size);
      }

      for (var i=0; i < size*step; i+=step) {
         var x = main.grx(poly.fP[i]),
             y = main.gry(poly.fP[i+1]),
             z = main.grz(poly.fP[i+2]);

         if (use_points) {
            pos[lll]   = x;
            pos[lll+1] = y;
            pos[lll+2] = z;
            lll+=3;
            continue;
         }

         for (var k=0,nn=-3;k<indicies.length;++k) {
            var vert = vertices[indicies[k]];
            pos[lll]   = x + (vert.x - 0.5)*scale;
            pos[lll+1] = y + (vert.y - 0.5)*scale;
            pos[lll+2] = z + (vert.z - 0.5)*scale;

            if (k%6===0) nn+=3;
            norm[lll] = normals[nn];
            norm[lll+1] = normals[nn+1];
            norm[lll+2] = normals[nn+2];

            lll+=3;
         }
      }

      var geom = new THREE.BufferGeometry();
      geom.addAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
      if (norm) geom.addAttribute( 'normal', new THREE.BufferAttribute( norm, 3 ) );

      var fcolor = JSROOT.Painter.root_colors[poly.fMarkerColor];

      if (use_points) {
         var material = new THREE.PointsMaterial( { size: 3*scale, color: fcolor } );
         var points = new THREE.Points(geom, material);

         main.toplevel.add(points);

         points.tip_color = (poly.fMarkerColor === 3) ? 0xFF0000 : 0x00FF00;
         points.poly = poly;
         points.painter = main;
         points.scale0 = 0.7*scale;

         points.tooltip = function(intersect) {

            var indx = intersect.index*3;
            if ((indx<0) || (indx >= this.poly.fP.length)) return null;
            var p = this.painter;

            var tip = { info: "bin: " + indx/3 + "<br/>" +
                  "x: " + p.x_handle.format(this.poly.fP[indx]) + "<br/>" +
                  "y: " + p.y_handle.format(this.poly.fP[indx+1]) + "<br/>" +
                  "z: " + p.z_handle.format(this.poly.fP[indx+2]) };

            var grx = p.grx(this.poly.fP[indx]),
                gry = p.gry(this.poly.fP[indx+1]),
                grz = p.grz(this.poly.fP[indx+2]);

            tip.x1 = grx - this.scale0; tip.x2 = grx + this.scale0;
            tip.y1 = gry - this.scale0; tip.y2 = gry + this.scale0;
            tip.z1 = grz - this.scale0; tip.z2 = grz + this.scale0;

            tip.color = this.tip_color;

            return tip;
         }

      } else {

         // var material = new THREE.MeshPhongMaterial({ color : fcolor, specular : 0x4f4f4f});
         var material = new THREE.MeshBasicMaterial( { color: fcolor, shading: THREE.SmoothShading  } );

         var mesh = new THREE.Mesh(geom, material);

         main.toplevel.add(mesh);

         mesh.step = step;
         mesh.nvertex = indicies.length;
         mesh.poly = poly;
         mesh.painter = main;
         mesh.scale0 = 0.7*scale; // double size
         mesh.tip_color = (poly.fMarkerColor === 3) ? 0xFF0000 : 0x00FF00;

         mesh.tooltip = function(intersect) {
            var indx = Math.floor(intersect.index / this.nvertex) * this.step;
            if ((indx<0) || (indx >= this.poly.fP.length)) return null;
            var p = this.painter;

            var tip = { info: "bin: " + indx/3 + "<br/>" +
                  "x: " + p.x_handle.format(this.poly.fP[indx]) + "<br/>" +
                  "y: " + p.y_handle.format(this.poly.fP[indx+1]) + "<br/>" +
                  "z: " + p.z_handle.format(this.poly.fP[indx+2]) };

            var grx = p.grx(this.poly.fP[indx]),
                gry = p.gry(this.poly.fP[indx+1]),
                grz = p.grz(this.poly.fP[indx+2]);

            tip.x1 = grx - this.scale0; tip.x2 = grx + this.scale0;
            tip.y1 = gry - this.scale0; tip.y2 = gry + this.scale0;
            tip.z1 = grz - this.scale0; tip.z2 = grz + this.scale0;

            tip.color = this.tip_color;

            return tip;
         }
      }

      main.Render3D(100); // set large timeout to be able draw other points

      return this.DrawingReady();
   }

   return JSROOT.Painter;

}));

