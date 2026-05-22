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
        const displayCurr = (currency === "Todos") ? "USD" : currency;
        return formatCurrency(value, displayCurr);
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
                    backgroundColor: [
                        'rgba(14, 165, 233, 0.6)',
                        'rgba(16, 185, 129, 0.6)',
                        'rgba(139, 92, 246, 0.6)',
                        'rgba(245, 158, 11, 0.6)',
                        'rgba(249, 115, 22, 0.6)'
                    ],
                    borderColor: [
                        '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f97316'
                    ],
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
                                return ` Saldo: ${formatActiveVal(context.raw)}`;
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
                labels: clienteData.labels.map(l => l.length > 25 ? l.substring(0, 22) + "..." : l),
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
                                return ` Saldo Vencido: ${formatActiveVal(context.raw)}`;
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
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.65)',  // Cat. A - Verde
                        'rgba(14, 165, 233, 0.65)',  // Cat. B - Azul
                        'rgba(245, 158, 11, 0.65)',  // Cat. C - Amarillo
                        'rgba(249, 115, 22, 0.65)',  // Cat. D - Naranja
                        'rgba(239, 68, 68, 0.65)'    // Cat. E - Rojo
                    ],
                    borderColor: [
                        '#10b981', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444'
                    ],
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
            fSelect.value = filialId;
            fSelect.dispatchEvent(new Event("change"));
        }
    };
    
    const updateMap = async () => {
        if (!map) return;
        try {
            const activeMoneda = document.getElementById("filter-moneda").value;
            const activeFilial = document.getElementById("filter-filial").value;
            
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
                
                // Resaltar visualmente si esta filial está seleccionada individualmente
                let isSelected = (f.id === activeFilial);
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
                                <span class="val">${formatCurrency(f.cartera_total, displayCurr)}</span>
                            </div>
                            <div class="map-popup-row">
                                <span>Cartera Vencida:</span>
                                <span class="val text-red">${formatCurrency(f.cartera_vencida, displayCurr)}</span>
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
            
            // Autoenfocar si hay filtros individuales seleccionados
            if (activeFilial !== "Todos" && data.length > 0) {
                const selected = data.find(f => f.id === activeFilial);
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
            const activeFilial = document.getElementById("filter-filial").value;
            const activeMoneda = document.getElementById("filter-moneda").value;
            
            const queryParams = `?filial=${activeFilial}&moneda=${activeMoneda}`;
            
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
    
    // 8. Opciones de Filtro Autocompletadas desde Backend
    const loadFilterOptions = async () => {
        try {
            const res = await fetch("/api/filters/options");
            const data = await res.json();
            
            const fSelect = document.getElementById("filter-filial");
            const mSelect = document.getElementById("filter-moneda");
            
            // Preservar valores seleccionados si existen
            const prevFilial = fSelect.value;
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
            
            // Intentar restaurar valores previos si siguen existiendo
            if (Array.from(fSelect.options).some(o => o.value === prevFilial)) fSelect.value = prevFilial;
            if (Array.from(mSelect.options).some(o => o.value === prevMoneda)) mSelect.value = prevMoneda;
            
        } catch (error) {
            console.error("Error cargando configuraciones de filtros dinámicos:", error);
        }
    };
    
    // Inicializar Componentes de Dashboard
    initMap();
    
    const initializeDashboard = async () => {
        await loadFilterOptions();
        await fetchDashboardData();
    };
    
    initializeDashboard();
    
    // Escuchar cambios en los dropdowns
    document.getElementById("filter-filial").addEventListener("change", fetchDashboardData);
    document.getElementById("filter-moneda").addEventListener("change", fetchDashboardData);
    
    // Botón para limpiar filtros
    document.getElementById("btn-clear-filters").addEventListener("click", () => {
        document.getElementById("filter-filial").value = "Todos";
        document.getElementById("filter-moneda").value = "Todos";
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
    btnExport.addEventListener("click", () => {
        window.location.href = "/api/export/star-schema";
    });

    // 11. Botón Exportar Reporte Ejecutivo PDF
    const btnExportPDF = document.getElementById("btn-export-pdf");
    btnExportPDF.addEventListener("click", async () => {
        const originalHTML = btnExportPDF.innerHTML;
        try {
            btnExportPDF.disabled = true;
            btnExportPDF.innerHTML = `<i data-lucide="loader" class="spin" style="animation: spin 1s linear infinite;"></i> <span>Generando...</span>`;
            lucide.createIcons();
            
            const activeFilial = document.getElementById("filter-filial").value;
            const activeMoneda = document.getElementById("filter-moneda").value;
            const queryParams = `?filial=${activeFilial}&moneda=${activeMoneda}`;
            
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
            const fSelect = document.getElementById("filter-filial");
            const displayNameFilial = fSelect.options[fSelect.selectedIndex].text;
            
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
            document.getElementById("pdf-kpi-recuperacion").textContent = `${kpis.indice_recuperacion}%`;
            document.getElementById("pdf-kpi-dso").textContent = `${kpis.dso} días`;
            document.getElementById("pdf-kpi-costo-mora").textContent = formatActiveVal(kpis.costo_mora);
            
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
                            <td style="padding: 8px 10px; color: #0f172a; font-weight: 500;">${label}</td>
                            <td style="padding: 8px 10px; text-align: right; color: #ef4444; font-weight: 700;">${formatActiveVal(val)}</td>
                        </tr>
                    `;
                });
            }
            
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
