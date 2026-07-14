/* ==========================================================================
   INTERACTIVIDAD Y LÓGICA DE NEGOCIO EN FRONTEND - DASHBOARD DE CARTERA
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Inicializar Iconos Lucide
    lucide.createIcons();
    
    // 2. Control de Pestañas (Navegación Sidebar)
    const menuItems = document.querySelectorAll(".menu-item");
    const tabContents = document.querySelectorAll(".tab-content");
    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");
    
    const tabMetadata = {
        "dashboard": { title: "Dashboard Analítico de Cartera", subtitle: "Monitoreo en tiempo real e indicadores clave financieros" },
        "etl": { title: "Procesador de Datos (ETL)", subtitle: "Transforma tu archivo Excel al Modelo Estrella optimizado para Power BI" },
        "dax": { title: "Guía de Integración DAX & Power BI", subtitle: "Fórmulas de negocio y mejores prácticas de modelado de datos" }
    };
    
    menuItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-tab");
            
            menuItems.forEach(mi => mi.classList.remove("active"));
            item.classList.add("active");
            
            tabContents.forEach(tc => tc.classList.remove("active"));
            document.getElementById(`tab-${tabId}`).classList.add("active");
            
            pageTitle.textContent = tabMetadata[tabId].title;
            pageSubtitle.textContent = tabMetadata[tabId].subtitle;
            
            // Si cargamos el tab dashboard y el mapa ya existe, reajustar tamaño para evitar glitches de dibujado
            if (tabId === "dashboard" && map) {
                setTimeout(() => {
                    map.invalidateSize();
                }, 100);
            }
        });
    });
    
    // 3. Diccionario de Medidas DAX
    const daxDatabase = {
        "dax-total": {
            title: "1. Cartera Total",
            code: "Cartera Total = SUM(FactCartera[Saldo])",
            desc: "Suma todos los saldos por cobrar pendientes de pago. Es el valor total bruto de la cartera viva en la organización."
        },
        "dax-vencida": {
            title: "2. Cartera Vencida",
            code: "Cartera Vencida = \nCALCULATE(\n    [Cartera Total],\n    FactCartera[DiasMora] > 0\n)",
            desc: "Suma el saldo por cobrar que ha excedido su fecha límite de vencimiento (Días de Mora > 0)."
        },
        "dax-morosidad": {
            title: "3. Índice de Morosidad",
            code: "Indice Morosidad = \nDIVIDE(\n    [Cartera Vencida],\n    [Cartera Total],\n    0\n)",
            desc: "Representa el porcentaje de la cartera que se encuentra vencida. Ideal para medir el riesgo de crédito general y la salud del recaudo."
        },
        "dax-recuperacion": {
            title: "4. Índice de Recuperación de Cartera",
            code: "Indice Recuperacion = \nDIVIDE(\n    SUM(FactCartera[MontoRecaudado]),\n    SUM(FactCartera[MontoFacturado]),\n    0\n)",
            desc: "Mide la efectividad del cobro comparando el recaudo acumulado frente al total que fue facturado originalmente en el periodo analizado."
        },
        "dax-rotacion": {
            title: "5. Rotación de Cartera",
            code: "Rotacion Cartera = \nDIVIDE(\n    SUM(FactCartera[VentasCredito]),\n    AVERAGE(FactCartera[Saldo]),\n    0\n)",
            desc: "Indica cuántas veces gira la cartera en el año. Mide la velocidad con la que la empresa recupera comercialmente sus cuentas por cobrar."
        },
        "dax-dso": {
            title: "6. Días Promedio de Pago (DSO)",
            code: "DSO = \nDIVIDE(\n    AVERAGE(FactCartera[Saldo]) * 365,\n    SUM(FactCartera[VentasCredito]),\n    0\n)",
            desc: "Days Sales Outstanding. Expresa el promedio de días reales que tarda la organización en recaudar una factura emitida a crédito."
        },
        "dax-costo": {
            title: "7. Costo Financiero de la Mora",
            code: "Costo Mora = \nSUMX(\n    FILTER(FactCartera, FactCartera[DiasMora] > 0),\n    FactCartera[Saldo] * (FactCartera[DiasMora] / 365) * FactCartera[TasaCostoOportunidad]\n)",
            desc: "Calcula el costo de oportunidad financiero (pérdida económica implícita) derivado de tener capital estancado en facturas vencidas, aplicando la tasa anual parametrizada."
        }
    };
    
    // Navegador DAX interactivo
    const daxBtns = document.querySelectorAll(".dax-btn");
    const daxTitle = document.getElementById("dax-selected-title");
    const daxCode = document.getElementById("dax-code-block");
    const daxDesc = document.getElementById("dax-selected-desc");
    const btnCopy = document.getElementById("btn-copy-dax");
    
    daxBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const daxId = btn.getAttribute("data-dax-id");
            const daxData = daxDatabase[daxId];
            
            daxBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            daxTitle.textContent = daxData.title;
            daxCode.textContent = daxData.code;
            daxDesc.textContent = daxData.desc;
        });
    });
    
    btnCopy.addEventListener("click", () => {
        const textToCopy = daxCode.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHTML = btnCopy.innerHTML;
            btnCopy.innerHTML = `<i data-lucide="check"></i> ¡Copiado!`;
            lucide.createIcons();
            
            setTimeout(() => {
                btnCopy.innerHTML = originalHTML;
                lucide.createIcons();
            }, 2000);
        }).catch(err => {
            console.error("Error al copiar código DAX: ", err);
        });
    });
    
    // ── Conversión de Moneda ──────────────────────────────────────────────────
    // Tasas de cambio activas (Moneda Local / USD) obtenidas del backend
    let currentRates = { 'USD': 1.0 };
    
    // Cache de todas las monedas disponibles (para restaurar al deseleccionar filial)
    let allMonedaOptions = [];
    
    // Mapa filial → código de moneda local oficial
    const FILIAL_MONEDA_MAP = {
        'BU_IC_PERU':      'PEN',  // Sol peruano
        'BU_IC_MEXICO':    'MXN',  // Peso mexicano
        'BU_IC_CHILE':     'CLP',  // Peso chileno
        'BU_IC_ECUADOR':   'USD',  // Ecuador ya usa USD
        'BU_IC_SALVADOR':  'USD',  // El Salvador ya usa USD
        'BU_IC_GUATEMALA': 'GTQ',  // Quetzal guatemalteco
        'BU_IC_HONDURAS':  'HNL'   // Lempira hondureño
    };
    
    const CURRENCY_LABELS = {
        'USD': 'USD — Dólar Estadounidense',
        'PEN': 'PEN — Sol Peruano',
        'MXN': 'MXN — Peso Mexicano',
        'CLP': 'CLP — Peso Chileno',
        'GTQ': 'GTQ — Quetzal Guatemalteco',
        'HNL': 'HNL — Lempira Hondureño'
    };
    // ────────────────────────────────────────────────────────────────────

    // 4. Formateadores Financieros Flexibles
    const formatCurrency = (value, currency = "USD") => {
        const loc = (currency === "COP" || currency === "COP$") ? "es-CO" : "en-US";
        return new Intl.NumberFormat(loc, {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    };
    
    const formatActiveVal = (value) => {
        const mSelect = document.getElementById("filter-moneda");
        const currency = mSelect ? mSelect.value : "USD";
        const displayCurr = (currency === "Todos" || !currency) ? "USD" : currency;
        // Aplicar tasa de conversión: todos los valores del backend llegan en USD
        const rate = currentRates[displayCurr] || 1.0;
        return formatCurrency(value * rate, displayCurr);
    };
    
    // 5. Inicialización de Gráficos (Chart.js)
    let chartMora = null;
    let chartSectores = null;
    let chartClientes = null;
    let chartRiesgo = null;
    
    const initCharts = (moraData, sectorData, clienteData, riesgoData) => {
        Chart.defaults.color = "#94a3b8";
        Chart.defaults.font.family = "'Outfit', sans-serif";
        Chart.defaults.font.size = 11;
        
        const gridConfig = {
            color: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.08)"
        };
        
        // A. Gráfico Mora (Barras Columnas)
        const ctxMora = document.getElementById("chart-mora").getContext("2d");
        if (chartMora) chartMora.destroy();
        chartMora = new Chart(ctxMora, {
            type: 'bar',
            data: {
                labels: moraData.labels,
                datasets: [{
                    label: 'Saldo Vencido',
                    data: moraData.values,
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.55)', // Al día - Verde
                        'rgba(245, 158, 11, 0.55)', // 1-30 días - Amarillo
                        'rgba(249, 115, 22, 0.55)', // 31-60 días - Naranja
                        'rgba(239, 68, 68, 0.65)',  // 61-90 días - Rojo
                        'rgba(244, 63, 94, 0.85)'   // >90 días - Coral
                    ],
                    borderColor: [
                        '#10b981', '#f59e0b', '#f97316', '#ef4444', '#f43f5e'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` Saldo: ${formatActiveVal(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: gridConfig,
                        ticks: {
                            callback: function(value) {
                                return formatActiveVal(value);
                            }
                        }
                    }
                }
            }
        });
        
        // B. Gráfico Sectorial (Dona)
        const ctxSectores = document.getElementById("chart-sectores").getContext("2d");
        if (chartSectores) chartSectores.destroy();
        chartSectores = new Chart(ctxSectores, {
            type: 'doughnut',
            data: {
                labels: sectorData.labels,
                datasets: [{
                    data: sectorData.values,
                    backgroundColor: sectorData.labels.map((_, i) => {
                        const colors = ['rgba(14, 165, 233, 0.6)', 'rgba(16, 185, 129, 0.6)', 'rgba(139, 92, 246, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(249, 115, 22, 0.6)'];
                        return colors[i % colors.length];
                    }),
                    borderColor: sectorData.labels.map((_, i) => {
                        const colors = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f97316'];
                        return colors[i % colors.length];
                    }),
                    borderWidth: 1.5,
                    hoverOffset: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            boxWidth: 12,
                            boxHeight: 12,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                let total = 0;
                                const dataArr = context.chart.data.datasets[0].data;
                                dataArr.forEach(val => { total += val; });
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + "%" : "0%";
                                return ` Saldo: ${formatActiveVal(value)} (${percentage})`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
        
        // C. Gráfico Clientes Críticos
        const ctxClientes = document.getElementById("chart-clientes").getContext("2d");
        if (chartClientes) chartClientes.destroy();
        chartClientes = new Chart(ctxClientes, {
            type: 'bar',
            data: {
                labels: clienteData.labels.map(l => { const s = String(l || ""); return s.length > 25 ? s.substring(0, 22) + "..." : s; }),
                datasets: [{
                    label: 'Cartera Vencida',
                    data: clienteData.values,
                    backgroundColor: 'rgba(244, 63, 94, 0.55)',
                    borderColor: '#f43f5e',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    barThickness: 16
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw;
                                const total = clienteData.total_mora || val;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` Saldo Vencido: ${formatActiveVal(val)} (${pct}% del riesgo total)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: gridConfig,
                        ticks: {
                            callback: function(value) {
                                return formatActiveVal(value);
                            }
                        }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
        
        // D. Gráfico de Clasificación de Riesgo Crediticio (Dona)
        const ctxRiesgo = document.getElementById("chart-riesgo").getContext("2d");
        if (chartRiesgo) chartRiesgo.destroy();
        chartRiesgo = new Chart(ctxRiesgo, {
            type: 'doughnut',
            data: {
                labels: riesgoData.labels,
                datasets: [{
                    data: riesgoData.values,
                    backgroundColor: riesgoData.labels.map((_, i) => {
                        const colors = ['rgba(16, 185, 129, 0.65)', 'rgba(14, 165, 233, 0.65)', 'rgba(245, 158, 11, 0.65)', 'rgba(249, 115, 22, 0.65)', 'rgba(239, 68, 68, 0.65)'];
                        return colors[i % colors.length];
                    }),
                    borderColor: riesgoData.labels.map((_, i) => {
                        const colors = ['#10b981', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444'];
                        return colors[i % colors.length];
                    }),
                    borderWidth: 1.5,
                    hoverOffset: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            boxWidth: 10,
                            boxHeight: 10,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` Saldo: ${formatActiveVal(context.raw)}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    };
    
    // 6. Inicialización e Integración del Mapa Leaflet
    let map = null;
    let markersLayer = null;
    
    const initMap = () => {
        const mapContainer = document.getElementById("map");
        if (!mapContainer) return;
        
        // Inicializar mapa centrado en LatAm
        map = L.map('map', {
            zoomControl: true,
            scrollWheelZoom: false
        }).setView([6.0, -75.0], 3);
        
        // Cargar mosaicos oscuros de CartoDB (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);
        
        // LayerGroup para contener marcadores de filiales
        markersLayer = L.layerGroup().addTo(map);
    };
    
    // Función global para filtrar desde el mapa al hacer clic
    window.filterFromMap = (filialId) => {
        const fSelect = document.getElementById("filter-filial");
        if (fSelect) {
            Array.from(fSelect.options).forEach(opt => opt.selected = false);
            const targetOpt = Array.from(fSelect.options).find(opt => opt.value === filialId);
            if (targetOpt) targetOpt.selected = true;
            fSelect.dispatchEvent(new Event("change"));
        }
    };
    
    const updateMap = async () => {
        if (!map) return;
        try {
            const activeMoneda = document.getElementById("filter-moneda").value;
            const fSelect = document.getElementById("filter-filial");
            const activeFiliales = Array.from(fSelect.selectedOptions).map(o => o.value);
            
            // Si hay múltiples filiales seleccionadas, se procesarán en el mapa. 
            // Para el parámetro filial del mapa usaremos la primera o "Todos" si hay varias.
            // (El endpoint de mapa no filtra por filial, devuelve todas, el filtro es visual).
            const mapActiveFilial = (activeFiliales.includes("Todos") || activeFiliales.length === 0) ? "Todos" : activeFiliales.join(",");
            
            // Consultar coordenadas y saldos consolidados
            const res = await fetch(`/api/map/filiales?moneda=${activeMoneda}`);
            const data = await res.json();
            
            markersLayer.clearLayers();
            
            data.forEach(f => {
                if (f.lat === 0 && f.lng === 0) return;
                
                // Radio proporcional al saldo total (mínimo 8, máximo 28)
                let radius = Math.max(8, Math.min(28, f.cartera_total * 0.00012 + 6));
                
                // Colorear de acuerdo con el porcentaje de morosidad
                let color = "#10b981"; // Sano
                let fillOpacity = 0.45;
                if (f.morosidad > 50) {
                    color = "#f43f5e"; // Crítico
                } else if (f.morosidad >= 30) {
                    color = "#f59e0b"; // Alerta
                }
                
                // Resaltar visualmente si esta filial está seleccionada (aplica también a selección múltiple)
                let isSelected = activeFiliales.includes(f.id);
                let weight = isSelected ? 4 : 1.5;
                let dashArray = isSelected ? "4,4" : "";
                if (isSelected) {
                    radius += 4;
                    fillOpacity = 0.7;
                }
                
                const displayCurr = (activeMoneda === "Todos") ? "USD" : activeMoneda;
                
                const marker = L.circleMarker([f.lat, f.lng], {
                    radius: radius,
                    fillColor: color,
                    color: isSelected ? "#0ea5e9" : color,
                    weight: weight,
                    opacity: 0.85,
                    fillOpacity: fillOpacity,
                    dashArray: dashArray
                });
                
                // Popup glassmorphic
                const popupHTML = `
                    <div class="map-popup-container">
                        <div class="map-popup-header">
                            <h4>${f.name}</h4>
                            <span class="map-popup-badge badge-${f.morosidad < 30 ? 'healthy' : f.morosidad <= 50 ? 'warning' : 'danger'}">
                                Mora: ${f.morosidad.toFixed(1)}%
                            </span>
                        </div>
                        <div class="map-popup-body">
                            <div class="map-popup-row">
                                <span>Cartera Total:</span>
                                <span class="val">${formatActiveVal(f.cartera_total)}</span>
                            </div>
                            <div class="map-popup-row">
                                <span>Cartera Vencida:</span>
                                <span class="val text-red">${formatActiveVal(f.cartera_vencida)}</span>
                            </div>
                            <div class="map-popup-row">
                                <span>Clientes Activos:</span>
                                <span class="val highlight">${f.num_clientes}</span>
                            </div>
                        </div>
                        <button class="btn-popup-filter" onclick="filterFromMap('${f.id}')">
                            <i data-lucide="filter"></i> Aplicar Filtro de Filial
                        </button>
                    </div>
                `;
                
                marker.bindPopup(popupHTML, {
                    closeButton: true,
                    offset: L.point(0, -2)
                });
                
                markersLayer.addLayer(marker);
            });
            
            // Autoenfocar si hay filtros individuales seleccionados y es uno solo
            if (!activeFiliales.includes("Todos") && activeFiliales.length === 1 && data.length > 0) {
                const selected = data.find(f => f.id === activeFiliales[0]);
                if (selected && selected.lat !== 0) {
                    map.setView([selected.lat, selected.lng], 5);
                }
            } else {
                // Volver a centrar de forma global
                map.setView([6.0, -75.0], 3);
            }
            
            // Habilitar iconos en popups dinámicos
            map.on('popupopen', () => {
                lucide.createIcons();
            });
            
            // Actualizar el widget de barras de progreso de filiales
            updateFilialesRiskWidget(data);
            
        } catch (error) {
            console.error("Error cargando geolocalizaciones de filiales: ", error);
        }
    };

    // Función para renderizar el widget de monitoreo de filiales
    const updateFilialesRiskWidget = (filialesData) => {
        const listContainer = document.getElementById("filiales-risk-list");
        if (!listContainer) return;
        
        listContainer.innerHTML = "";
        
        if (!filialesData || filialesData.length === 0 || filialesData.every(f => f.cartera_total === 0)) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.85rem;">
                    <i data-lucide="alert-circle" style="width: 24px; height: 24px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                    <p>No hay datos disponibles para filiales. Por favor, procesa un archivo Excel en la pestaña ETL.</p>
                </div>`;
            lucide.createIcons();
            return;
        }
        
        // Ordenar filiales por cartera total descendente
        const sorted = [...filialesData].sort((a, b) => b.cartera_total - a.cartera_total);
        
        sorted.forEach(f => {
            if (f.cartera_total === 0) return;
            
            let progressClass = "progress-green";
            if (f.morosidad > 50) {
                progressClass = "progress-red";
            } else if (f.morosidad >= 30) {
                progressClass = "progress-orange";
            }
            
            let displayName = f.name.replace(" (BU)", "");
            
            const rowHtml = `
                <div class="filial-risk-row">
                    <div class="filial-risk-header">
                        <span class="filial-risk-name">
                            <i data-lucide="globe" style="width: 13px; height: 13px; color: var(--text-muted);"></i>
                            ${displayName}
                        </span>
                        <div class="filial-risk-vals">
                            <span class="filial-risk-balance">${formatActiveVal(f.cartera_total)}</span>
                            <span class="filial-risk-pct" style="color: ${f.morosidad > 50 ? '#ef4444' : f.morosidad >= 30 ? '#f59e0b' : '#10b981'}; font-weight: 600;">
                                ${f.morosidad.toFixed(1)}% mora
                            </span>
                        </div>
                    </div>
                    <div class="filial-progress-container">
                        <div class="filial-progress-bar ${progressClass}" style="width: ${Math.min(100, f.morosidad)}%;"></div>
                    </div>
                </div>
            `;
            listContainer.innerHTML += rowHtml;
        });
        
        lucide.createIcons();
    };
    
    // 7. Cargar Datos y Actualizar Dashboard
    const fetchDashboardData = async () => {
        try {
            const fSelect = document.getElementById("filter-filial");
            const rawFiliales = Array.from(fSelect.selectedOptions).map(o => o.value);
            const activeFiliales = (rawFiliales.length === 0 || rawFiliales.includes("Todos")) ? ["Todos"] : rawFiliales;
            const activeMoneda = document.getElementById("filter-moneda").value;
            
            // Cuando hay múltiples filiales específicas, el backend recibe moneda=Todos
            // para no excluir filas. El dropdown de moneda se fuerza a USD visualmente.
            const backendMoneda = (activeFiliales[0] !== "Todos" && activeFiliales.length > 0) ? "Todos" : activeMoneda;
            const queryParams = `?filial=${activeFiliales.join(",")}&moneda=${backendMoneda}`;
            
            // A. Obtener KPIs consolidados y filtrados
            const kpiRes = await fetch(`/api/kpis${queryParams}`);
            const kpis = await kpiRes.json();
            
            // Actualizar tarjetas principales usando formatActiveVal
            document.getElementById("kpi-total-val").textContent = formatActiveVal(kpis.cartera_total);
            document.getElementById("kpi-vencida-val").textContent = formatActiveVal(kpis.cartera_vencida);
            
            const morosidad = ((kpis.cartera_vencida / kpis.cartera_total) * 100) || 0.0;
            document.getElementById("kpi-morosidad-percent").textContent = `${morosidad.toFixed(1)}% de morosidad`;
            
            document.getElementById("kpi-recuperacion-val").textContent = `${kpis.indice_recuperacion}%`;
            document.getElementById("kpi-rotacion-val").textContent = `${kpis.rotacion_cartera}x`;
            document.getElementById("kpi-dso-val").textContent = `${kpis.dso} días`;
            document.getElementById("kpi-cobro-real-val").textContent = `Cobro real promedio: ${kpis.dias_cobro_reales} días`;
            document.getElementById("kpi-costo-mora-val").textContent = formatActiveVal(kpis.costo_mora);
            
            // B. Obtener conjuntos de datos filtrados para gráficos
            const [moraRes, sectorRes, clienteRes, riesgoRes] = await Promise.all([
                fetch(`/api/charts/mora${queryParams}`),
                fetch(`/api/charts/sectores${queryParams}`),
                fetch(`/api/charts/clientes${queryParams}`),
                fetch(`/api/charts/riesgo${queryParams}`)
            ]);
            
            const moraData = await moraRes.json();
            const sectorData = await sectorRes.json();
            const clienteData = await clienteRes.json();
            const riesgoData = await riesgoRes.json();
            
            // Redibujar gráficos
            initCharts(moraData, sectorData, clienteData, riesgoData);
            
            // C. Actualizar marcadores geográficos del mapa
            await updateMap();
            
        } catch (error) {
            console.error("Error al cargar los datos del API: ", error);
        }
    };
    
    // --- Custom Multi-Select UI Logic ---
    const initCustomMultiselect = () => {
        const nativeSelect = document.getElementById("filter-filial");
        const container = document.getElementById("custom-filial-container");
        if (!nativeSelect || !container) return;
        
        let wrapper = container.querySelector(".custom-multiselect-wrapper");
        if (wrapper) {
            nativeSelect.dispatchEvent(new Event("change"));
            return;
        }
        
        wrapper = document.createElement("div");
        wrapper.className = "custom-multiselect-wrapper";
        container.appendChild(wrapper);
            
            let display = document.createElement("div");
            display.className = "custom-multiselect-display";
            wrapper.appendChild(display);
            
            display.addEventListener("click", (e) => {
                if (e.target.closest(".remove-tag")) return; 
                wrapper.classList.toggle("open");
            });
            
            document.addEventListener("click", (e) => {
                if (!wrapper.contains(e.target)) wrapper.classList.remove("open");
            });
            
            let dropdown = document.createElement("div");
            dropdown.className = "multiselect-dropdown";
            wrapper.appendChild(dropdown);
            
            // Función de actualización que reconstruye visualmente en base al nativo
            const updateUI = () => {
                display.innerHTML = "";
                dropdown.innerHTML = "";
                
                const selectedOptions = Array.from(nativeSelect.selectedOptions);
                const allOptions = Array.from(nativeSelect.options);
                
                // Tags
                if (selectedOptions.length === 0 || (selectedOptions.length === 1 && selectedOptions[0].value === "Todos")) {
                    display.innerHTML = `<span class="multiselect-placeholder">Todas las Filiales (Global)</span>`;
                } else {
                    selectedOptions.forEach(opt => {
                        if (opt.value === "Todos") return;
                        const tag = document.createElement("span");
                        tag.className = "multiselect-tag";
                        tag.innerHTML = `${opt.text} <span class="remove-tag" data-val="${opt.value}">×</span>`;
                        display.appendChild(tag);
                    });
                }
                
                // Dropdown Options
                allOptions.forEach(opt => {
                    const isSelected = opt.selected;
                    const div = document.createElement("div");
                    div.className = `multiselect-option ${isSelected ? 'selected' : ''}`;
                    div.textContent = opt.text;
                    div.dataset.val = opt.value;
                    
                    div.addEventListener("click", () => {
                        if (opt.value === "Todos") {
                            allOptions.forEach(o => o.selected = false);
                            opt.selected = true;
                        } else {
                            opt.selected = !opt.selected;
                            const todosOpt = allOptions.find(o => o.value === "Todos");
                            if (todosOpt && opt.selected) todosOpt.selected = false;
                        }
                        
                        if (Array.from(nativeSelect.selectedOptions).length === 0) {
                            const todosOpt = allOptions.find(o => o.value === "Todos");
                            if (todosOpt) todosOpt.selected = true;
                        }
                        
                        nativeSelect.dispatchEvent(new Event("change"));
                        updateUI();
                    });
                    dropdown.appendChild(div);
                });
                
                // Events for removing tags
                display.querySelectorAll(".remove-tag").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const val = btn.dataset.val;
                        const opt = allOptions.find(o => o.value === val);
                        if (opt) opt.selected = false;
                        
                        if (Array.from(nativeSelect.selectedOptions).length === 0) {
                            const todosOpt = allOptions.find(o => o.value === "Todos");
                            if (todosOpt) todosOpt.selected = true;
                        }
                        
                        nativeSelect.dispatchEvent(new Event("change"));
                        updateUI();
                    });
                });
            };
            
            // Sync initial state
            updateUI();
            
            // Listen to external native changes (like reset button or map click)
            nativeSelect.addEventListener("change", () => {
                // Pequeño timeout para dejar que otros listeners se ejecuten si es necesario
                setTimeout(updateUI, 10);
            });
    };
    
    // 8. Opciones de Filtro Autocompletadas desde Backend
    const loadFilterOptions = async () => {
        try {
            const res = await fetch("/api/filters/options");
            const data = await res.json();
            
            const fSelect = document.getElementById("filter-filial");
            const mSelect = document.getElementById("filter-moneda");
            
            // Preservar valores seleccionados si existen (para multiselect)
            const prevFiliales = Array.from(fSelect.selectedOptions).map(o => o.value);
            const prevMoneda = mSelect.value;
            
            fSelect.innerHTML = `<option value="Todos">Todas las Filiales (Global)</option>`;
            mSelect.innerHTML = `<option value="Todos">Todas las Monedas</option>`;
            
            data.filiales.forEach(f => {
                let name = f;
                if (f === "BU_IC_PERU") name = "Perú";
                else if (f === "BU_IC_MEXICO") name = "México";
                else if (f === "BU_IC_CHILE") name = "Chile";
                else if (f === "BU_IC_ECUADOR") name = "Ecuador";
                else if (f === "BU_IC_SALVADOR") name = "El Salvador";
                else if (f === "BU_IC_GUATEMALA") name = "Guatemala";
                else if (f === "BU_IC_HONDURAS") name = "Honduras";
                
                fSelect.innerHTML += `<option value="${f}">${name}</option>`;
            });
            
            data.monedas.forEach(m => {
                mSelect.innerHTML += `<option value="${m}">${m}</option>`;
            });
            
            // Cachear todas las monedas disponibles (para restaurar al volver a "Todas las Filiales")
            allMonedaOptions = data.monedas;
            
            // Intentar restaurar valores previos si siguen existiendo
            Array.from(fSelect.options).forEach(opt => {
                if (prevFiliales.includes(opt.value)) opt.selected = true;
            });
            if (fSelect.selectedOptions.length === 0) fSelect.value = "Todos";
            if (Array.from(mSelect.options).some(o => o.value === prevMoneda)) mSelect.value = prevMoneda;
            
            // Inicializar o actualizar custom dropdown
            initCustomMultiselect();
            
        } catch (error) {
            console.error("Error cargando configuraciones de filtros dinámicos:", error);
        }
    };
    
    // Carga las tasas de cambio implícitas calculadas por el backend
    const loadCurrencyRates = async () => {
        try {
            const res = await fetch("/api/currency/rates");
            const data = await res.json();
            currentRates = { 'USD': 1.0, ...data };
            console.log("[Tasas] Cargadas desde backend:", currentRates);
        } catch (e) {
            console.error("Error cargando tasas de cambio:", e);
            currentRates = { 'USD': 1.0 };
        }
    };
    
    // Restringe el dropdown de Moneda según la(s) filial(es) seleccionada(s)
    const restrictMonedaByFilial = (filialesArr) => {
        const mSelect = document.getElementById("filter-moneda");
        if (!mSelect) return;
        
        if (filialesArr.length === 0 || filialesArr.includes("Todos") || filialesArr.length > 1) {
            // Restaurar todas las monedas disponibles si hay > 1 filial o "Todos"
            mSelect.innerHTML = `<option value="Todos">Todas las Monedas (Muestra USD)</option>`;
            allMonedaOptions.forEach(m => {
                mSelect.innerHTML += `<option value="${m}">${m}</option>`;
            });
            mSelect.value = "Todos";
            return;
        }
        
        const filialId = filialesArr[0];
        const localCurrency = FILIAL_MONEDA_MAP[filialId] || null;
        
        // Solo mostrar USD y la moneda local de la filial
        mSelect.innerHTML = `<option value="USD">${CURRENCY_LABELS['USD']}</option>`;
        
        if (localCurrency && localCurrency !== "USD") {
            const label = CURRENCY_LABELS[localCurrency] || localCurrency;
            mSelect.innerHTML += `<option value="${localCurrency}">${label}</option>`;
            mSelect.value = localCurrency;  // Auto-seleccionar moneda local
        } else {
            mSelect.value = "USD";
        }
    };
    
    // Inicializar Componentes de Dashboard
    initMap();
    
    const initializeDashboard = async () => {
        await loadFilterOptions();
        await loadCurrencyRates();
        await fetchDashboardData();
        
        // Cargar estado de archivo subido
        try {
            const res = await fetch("/api/upload/status");
            const data = await res.json();
            
            // Para la nueva tarjeta de Archivo Actual
            const previewActive = document.getElementById("current-file-preview");
            const previewInactive = document.getElementById("no-file-preview");
            const displayFilename = document.getElementById("display-filename");
            const displayUploadTime = document.getElementById("display-upload-time");
            
            if (data.filename) {
                if (previewActive && previewInactive && displayFilename && displayUploadTime) {
                    displayFilename.textContent = data.filename;
                    displayUploadTime.textContent = data.upload_time;
                    previewActive.style.display = "flex";
                    previewInactive.style.display = "none";
                }
            } else {
                if (previewActive) previewActive.style.display = "none";
                if (previewInactive) previewInactive.style.display = "flex";
            }
        } catch (e) {
            console.error("Error fetching upload status:", e);
        }
    };
    
    initializeDashboard();
    
    // Escuchar cambios en los dropdowns
    document.getElementById("filter-filial").addEventListener("change", (e) => {
        const fSelect = document.getElementById("filter-filial");
        // Si el usuario selecciona "Todos", quitar las demás selecciones para evitar confusión
        let selected = Array.from(fSelect.selectedOptions).map(o => o.value);
        if (selected.includes("Todos") && selected.length > 1) {
            Array.from(fSelect.options).forEach(opt => opt.selected = (opt.value === "Todos"));
            selected = ["Todos"];
        }
        
        restrictMonedaByFilial(selected);  // RF-01: restringir monedas
        fetchDashboardData();
    });
    document.getElementById("filter-moneda").addEventListener("change", fetchDashboardData);
    
    // Botón para limpiar filtros
    document.getElementById("btn-clear-filters").addEventListener("click", () => {
        const fSelect = document.getElementById("filter-filial");
        Array.from(fSelect.options).forEach(opt => opt.selected = (opt.value === "Todos"));
        restrictMonedaByFilial(["Todos"]);  // Restaurar todas las monedas
        fetchDashboardData();
    });
    
    // Botón reiniciar datos por defecto
    const btnReset = document.getElementById("btn-reset-data");
    btnReset.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/reset");
            const data = await res.json();
            if (data.success) {
                const originalText = btnReset.innerHTML;
                btnReset.innerHTML = `<i data-lucide="check"></i> Completado`;
                btnReset.classList.add("btn-primary");
                lucide.createIcons();
                
                await initializeDashboard();
                
                setTimeout(() => {
                    btnReset.innerHTML = originalText;
                    btnReset.classList.remove("btn-primary");
                    lucide.createIcons();
                }, 2000);
            }
        } catch (e) {
            console.error("Error al resetear datos simulados: ", e);
        }
    });
    
    // Botón para eliminar archivo actual
    const btnDeleteFile = document.getElementById("btn-delete-file");
    if (btnDeleteFile) {
        btnDeleteFile.addEventListener("click", async () => {
            if (confirm("¿Estás seguro de que deseas eliminar el archivo actual y volver a los datos por defecto?")) {
                try {
                    const res = await fetch("/api/reset");
                    const data = await res.json();
                    if (data.success) {
                        await initializeDashboard();
                    }
                } catch (e) {
                    console.error("Error al eliminar el archivo: ", e);
                }
            }
        });
    }
    
    // 9. Módulo de Carga ETL y Drag & Drop
    const dragDropArea = document.getElementById("drag-drop-area");
    const fileInput = document.getElementById("file-input");
    const uploadProgress = document.getElementById("upload-progress");
    const successMsg = document.getElementById("upload-success-msg");
    
    dragDropArea.addEventListener("click", () => {
        fileInput.click();
    });
    
    ["dragenter", "dragover"].forEach(eventName => {
        dragDropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragDropArea.classList.add("dragover");
        }, false);
    });
    
    ["dragleave", "drop"].forEach(eventName => {
        dragDropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragDropArea.classList.remove("dragover");
        }, false);
    });
    
    dragDropArea.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFileUpload(files[0]);
        }
    });
    
    fileInput.addEventListener("change", (e) => {
        if (fileInput.files.length) {
            handleFileUpload(fileInput.files[0]);
        }
    });
    
    const handleFileUpload = async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        
        dragDropArea.style.display = "none";
        successMsg.style.display = "none";
        uploadProgress.style.display = "flex";
        
        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });
            const result = await response.json();
            
            uploadProgress.style.display = "none";
            dragDropArea.style.display = "flex";
            
            if (response.ok && result.success) {
                successMsg.style.display = "flex";
                document.getElementById("data-status-text").textContent = "Datos Personalizados";
                
                await initializeDashboard();
                
                setTimeout(() => {
                    successMsg.style.display = "none";
                }, 4000);
            } else {
                alert(`Error en procesamiento ETL: ${result.error}`);
            }
        } catch (error) {
            uploadProgress.style.display = "none";
            dragDropArea.style.display = "flex";
            alert(`Error al establecer conexión con el servidor ETL: ${error.message}`);
        }
    };
    
    // 10. Botón Descargar Modelo Estrella
    const btnExport = document.getElementById("btn-export-excel");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            window.location.href = "/api/export/star-schema";
        });
    }

    // 11. Botón Exportar Reporte Ejecutivo PDF
    const btnExportPDF = document.getElementById("btn-export-pdf");
    btnExportPDF.addEventListener("click", async () => {
        const originalHTML = btnExportPDF.innerHTML;
        try {
            btnExportPDF.disabled = true;
            btnExportPDF.innerHTML = `<i data-lucide="loader" class="spin" style="animation: spin 1s linear infinite;"></i> <span>Generando...</span>`;
            lucide.createIcons();
            
            const fSelect = document.getElementById("filter-filial");
            const rawFiliales = Array.from(fSelect.selectedOptions).map(o => o.value);
            const activeFiliales = (rawFiliales.length === 0 || rawFiliales.includes("Todos")) ? ["Todos"] : rawFiliales;
            const activeMoneda = document.getElementById("filter-moneda").value;
            
            const backendMoneda = (activeFiliales[0] !== "Todos" && activeFiliales.length > 0) ? "Todos" : activeMoneda;
            const queryParams = `?filial=${activeFiliales.join(",")}&moneda=${backendMoneda}`;
            
            // Obtener datos consolidados para el PDF
            const [kpiRes, riskRes, clientRes, filRes] = await Promise.all([
                fetch(`/api/kpis${queryParams}`),
                fetch(`/api/charts/riesgo${queryParams}`),
                fetch(`/api/charts/clientes${queryParams}`),
                fetch(`/api/map/filiales?moneda=${activeMoneda}`)
            ]);
            
            const kpis = await kpiRes.json();
            const riskData = await riskRes.json();
            const clientData = await clientRes.json();
            const filData = await filRes.json();
            
            // Nombre descriptivo de la filial
            const displayNameFilial = Array.from(fSelect.selectedOptions).map(o => o.text).join(", ");
            
            const mSelect = document.getElementById("filter-moneda");
            const displayNameMoneda = mSelect.options[mSelect.selectedIndex].text;
            
            // 1. Rellenar metadatos en la plantilla PDF
            document.getElementById("pdf-report-date").textContent = `Fecha de Emisión: ${new Date().toLocaleString()}`;
            document.getElementById("pdf-context-filial").textContent = displayNameFilial;
            document.getElementById("pdf-context-moneda").textContent = displayNameMoneda;
            
            // 2. Rellenar KPIs
            document.getElementById("pdf-kpi-total").textContent = formatActiveVal(kpis.cartera_total);
            document.getElementById("pdf-kpi-vencida").textContent = formatActiveVal(kpis.cartera_vencida);
            
            const morosidad = ((kpis.cartera_vencida / kpis.cartera_total) * 100) || 0.0;
            document.getElementById("pdf-kpi-morosidad").textContent = `${morosidad.toFixed(1)}%`;
            document.getElementById("pdf-kpi-dso").textContent = `${kpis.dso} días`;
            
            // 3. Rellenar Clasificación de Riesgo
            const riskContainer = document.getElementById("pdf-risk-breakdown");
            riskContainer.innerHTML = "";
            const totalRiskSum = riskData.values.reduce((a, b) => a + b, 0);
            
            riskData.labels.forEach((label, idx) => {
                const val = riskData.values[idx];
                const pct = totalRiskSum > 0 ? (val / totalRiskSum * 100) : 0;
                let color = "#10b981"; // Cat A
                if (idx === 1) color = "#0ea5e9"; // Cat B
                else if (idx === 2) color = "#f59e0b"; // Cat C
                else if (idx === 3) color = "#f97316"; // Cat D
                else if (idx === 4) color = "#ef4444"; // Cat E
                
                riskContainer.innerHTML += `
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span style="font-weight: 500;">${label}</span>
                            <span style="font-weight: 700; color: ${color};">${formatActiveVal(val)} (${pct.toFixed(1)}%)</span>
                        </div>
                        <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: ${color};"></div>
                        </div>
                    </div>
                `;
            });
            
            // 4. Rellenar Desglose de Filiales
            const filialesContainer = document.getElementById("pdf-filiales-breakdown");
            filialesContainer.innerHTML = "";
            filData.forEach(f => {
                if (f.cartera_total === 0) return;
                let color = "#10b981";
                if (f.morosidad > 50) color = "#ef4444";
                else if (f.morosidad >= 30) color = "#f59e0b";
                
                filialesContainer.innerHTML += `
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span style="font-weight: 500;">${f.name.replace(" (BU)", "")}</span>
                            <span style="font-weight: 700;">${formatActiveVal(f.cartera_total)} <small style="color: ${color}; margin-left: 5px;">(${f.morosidad.toFixed(1)}% m)</small></span>
                        </div>
                        <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${Math.min(100, f.morosidad)}%; height: 100%; background: ${color};"></div>
                        </div>
                    </div>
                `;
            });
            
            if (filialesContainer.innerHTML === "") {
                filialesContainer.innerHTML = `<div style="color: #64748b; font-style: italic;">No hay desglose regional activo.</div>`;
            }
            
            // 5. Rellenar Tabla de Clientes Críticos (Top 5 en el PDF)
            const tbody = document.getElementById("pdf-table-clientes-body");
            tbody.innerHTML = "";
            const top5Labels = clientData.labels.slice(0, 5);
            const top5Values = clientData.values.slice(0, 5);
            
            if (top5Labels.length === 0) {
                tbody.innerHTML = `<tr><td colspan="2" style="padding: 10px; text-align: center; color: #64748b;">No hay clientes críticos con saldo vencido.</td></tr>`;
            } else {
                top5Labels.forEach((label, idx) => {
                    const val = top5Values[idx];
                    tbody.innerHTML += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 15px; color: #0f172a; font-weight: 500;">${label}</td>
                            <td style="padding: 10px 15px; text-align: right; color: #ef4444; font-weight: 700;">${formatActiveVal(val)}</td>
                        </tr>
                    `;
                });
            }
            
            // 5.5 Generar Análisis Ejecutivo Dinámico (Creativo y Corporativo)
            const analysisContainer = document.getElementById("pdf-executive-analysis");
            
            const riskLevel = morosidad > 20 ? "CRÍTICO" : (morosidad > 10 ? "PREVENTIVO" : "ESTABLE");
            let statusColor = morosidad > 20 ? "#ef4444" : (morosidad > 10 ? "#f59e0b" : "#10b981");
            
            // Hallazgos Principales
            let findings = [];
            findings.push(`La morosidad general se sitúa en <strong>${morosidad.toFixed(1)}%</strong>, nivel clasificado de riesgo <strong>${riskLevel}</strong>.`);
            
            if (kpis.dso > 60) {
                findings.push(`El ciclo operativo (DSO) alcanza <strong>${kpis.dso} días</strong>, lo que ralentiza sustancialmente la liquidez.`);
            } else {
                findings.push(`Alta eficiencia operativa reflejada en un ciclo de cobro de <strong>${kpis.dso} días</strong>.`);
            }
            
            let impactHtml = "";
            if (kpis.costo_mora > 0) {
                impactHtml = `<div style="margin-bottom: 6px;"><span style="color: #64748b;">Costo Oportunidad:</span> <strong>${formatActiveVal(kpis.costo_mora)}</strong> retenidos comercialmente.</div>`;
            }
            if (top5Labels.length > 0) {
                impactHtml += `<div><span style="color: #64748b;">Concentración Riesgo:</span> <strong>${top5Labels[0]}</strong> lidera con ${formatActiveVal(top5Values[0])} vencidos.</div>`;
            } else {
                impactHtml += `<div>No se registran concentraciones críticas de riesgo individualizado actualmente.</div>`;
            }

            let strategyText = "";
            if (morosidad > 20) {
                strategyText = `Se requiere comité de crédito inmediato. Bloquear la expedición de certificados a <strong>${top5Labels[0] || 'entidades principales'}</strong> hasta formalizar un acuerdo de pago vigente.`;
            } else if (morosidad > 10) {
                strategyText = `Activar protocolos de cobro persuasivo. Realizar acercamientos de control con cuentas que presentan más de 60 días de vencimiento continuo.`;
            } else {
                strategyText = `Sostener los esquemas de recaudación. Continuar fomentando descuentos por pronto pago para apalancar el capital circulante sano.`;
            }

            const analysisHTML = `
                <div style="display: flex; gap: 15px; font-size: 10px;">
                    <!-- Columna 1: Diagnóstico -->
                    <div style="flex: 1.2; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; border-top: 3px solid ${statusColor};">
                        <h4 style="margin: 0 0 10px 0; font-size: 10px; color: #0f172a; text-transform: uppercase;">1. Hallazgos Principales</h4>
                        <ul style="margin: 0; padding-left: 15px; color: #334155; display: flex; flex-direction: column; gap: 6px; line-height: 1.4;">
                            ${findings.map(f => `<li>${f}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <!-- Columna 2: Impactos -->
                    <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 10px; color: #0f172a; text-transform: uppercase;">2. Impacto Financiero</h4>
                        <div style="color: #334155; line-height: 1.4;">
                            ${impactHtml}
                        </div>
                    </div>
                    
                    <!-- Columna 3: Acción -->
                    <div style="flex: 1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 12px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 10px; color: #0369a1; text-transform: uppercase;">3. Acción Estratégica</h4>
                        <div style="color: #0c4a6e; line-height: 1.4;">
                            ${strategyText}
                        </div>
                    </div>
                </div>
            `;

            analysisContainer.innerHTML = analysisHTML;

            // 6. Generar PDF
            const element = document.getElementById("pdf-report-template");
            const opt = {
                margin:       [10, 10, 10, 10],
                filename:     `Reporte_Ejecutivo_ICONTEC_${displayNameFilial.replace(/ /g, '_')}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            await html2pdf().set(opt).from(element).save();
            
            // Exito
            btnExportPDF.innerHTML = `<i data-lucide="check"></i> <span>¡Descargado!</span>`;
            lucide.createIcons();
            
            setTimeout(() => {
                btnExportPDF.innerHTML = originalHTML;
                btnExportPDF.disabled = false;
                lucide.createIcons();
            }, 3000);
            
        } catch (error) {
            console.error("Error generando PDF: ", error);
            alert(`Error al generar el archivo PDF: ${error.message}`);
            btnExportPDF.innerHTML = originalHTML;
            btnExportPDF.disabled = false;
            lucide.createIcons();
        }
    });
});
