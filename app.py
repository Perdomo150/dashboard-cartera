import os
import random
from datetime import datetime, timedelta
import pandas as pd
from flask import Flask, jsonify, request, render_template, send_file, make_response
import io

app = Flask(__name__)

# Configuración del directorio de trabajo
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if "VERCEL" in os.environ:
    DATA_DIR = "/tmp"
else:
    DATA_DIR = os.path.join(BASE_DIR, "data")
    os.makedirs(DATA_DIR, exist_ok=True)

# Variables globales para persistencia en memoria durante la ejecución local
CURRENT_DATA = None

# Coordenadas geográficas para mapa internacional (Filiales reales e ICONTEC/Cyrgo)
FILIAL_COORDINATES = {
    "BU_IC_PERU": {"lat": -9.1900, "lng": -75.0152, "name": "Perú (BU)"},
    "BU_IC_HONDURAS": {"lat": 15.2000, "lng": -86.2419, "name": "Honduras (BU)"},
    "BU_IC_ECUADOR": {"lat": -1.8312, "lng": -78.1834, "name": "Ecuador (BU)"},
    "BU_IC_CHILE": {"lat": -35.6751, "lng": -71.5430, "name": "Chile (BU)"},
    "BU_IC_SALVADOR": {"lat": 13.7942, "lng": -88.8965, "name": "El Salvador (BU)"},
    "BU_IC_GUATEMALA": {"lat": 15.7835, "lng": -90.2308, "name": "Guatemala (BU)"},
    "BU_IC_MEXICO": {"lat": 23.6345, "lng": -102.5528, "name": "México (BU)"},
    
    # Fallbacks de regiones para datos simulados
    "Bogotá": {"lat": 4.7110, "lng": -74.0721, "name": "Bogotá D.C."},
    "Girardot": {"lat": 4.3015, "lng": -74.8055, "name": "Girardot (Cund.)"},
    "Cali": {"lat": 3.4516, "lng": -76.5320, "name": "Cali (Valle)"},
    "Medellín": {"lat": 6.2442, "lng": -75.5812, "name": "Medellín (Ant.)"},
    "Bucaramanga": {"lat": 7.1193, "lng": -73.1227, "name": "Bucaramanga (Sant.)"},
    "Neiva": {"lat": 2.9273, "lng": -75.2819, "name": "Neiva (Huila)"}
}

def load_and_parse_real_excel():
    """Carga y homologa el archivo de Excel real de cartera a nuestro formato estándar."""
    file_path = r""
    if not os.path.exists(file_path):
        return None
    try:
        df = pd.read_excel(file_path, sheet_name="CARTERA TOTAL")
        
        # Homologar columnas críticas
        homologated = pd.DataFrame()
        
        # 1. Identificadores
        homologated["FacturaID"] = df["FACTURA"].fillna("S/N").astype(str).str.replace(".0", "", regex=False)
        homologated["ClienteID"] = df["NIT"].fillna("S/D").astype(str).str.replace(".0", "", regex=False)
        homologated["ClienteNombre"] = df["CLIENTE"].fillna("Cliente Desconocido").astype(str)
        
        # 2. Segmentaciones Internacionales
        homologated["UnidadNegocio"] = df["UNIDAD NEGOCIO"].fillna("S/F").astype(str)
        homologated["Moneda"] = df["MONEDA"].fillna("USD").astype(str)
        
        # Usar Unidad Técnica y Servicio como descriptores
        homologated["Sector"] = df["UNIDAD TÉCNICA"].fillna("General").astype(str)
        homologated["Region"] = df["UNIDAD NEGOCIO"].fillna("Internacional").astype(str)
        
        # 3. Fechas
        homologated["FechaFactura"] = pd.to_datetime(df["FECHA FACTURA"], errors="coerce").dt.strftime("%Y-%m-%d")
        homologated["FechaVencimiento"] = pd.to_datetime(df["FECHA VCTO"], errors="coerce").dt.strftime("%Y-%m-%d")
        homologated["FechaPago"] = ""
        
        # 4. Importes en Dólares (Moneda Estándar de Dashboard)
        # Saldo en Dólares es la base para consolidar sin mezclar divisas
        homologated["Saldo"] = pd.to_numeric(df["SALDO PENDIENTE EN DOLARES"], errors="coerce").fillna(0.0)
        homologated["SaldoLocal"] = pd.to_numeric(df["SALDO PENDIENTE MONEDA LOCAL"], errors="coerce").fillna(0.0)
        
        monto_original_local = pd.to_numeric(df["MONTO ORIGINAL"], errors="coerce").fillna(0.0)
        
        monto_original_usd = []
        for idx, row in df.iterrows():
            m_local = monto_original_local.iloc[idx]
            s_usd = homologated["Saldo"].iloc[idx]
            s_local = homologated["SaldoLocal"].iloc[idx]
            if s_usd > 0 and s_local > 0:
                tasa = s_local / s_usd
                m_usd = m_local / tasa
            else:
                m_usd = s_usd # fallback
            monto_original_usd.append(m_usd)
            
        homologated["MontoFacturado"] = monto_original_usd
        homologated["MontoRecaudado"] = homologated["MontoFacturado"] - homologated["Saldo"]
        
        # 5. Parámetros adicionales
        homologated["TasaCostoOportunidad"] = 0.12
        homologated["VentasCredito"] = homologated["MontoFacturado"] * 1.5
        homologated["Riesgo"] = "Medio"
        
        # Columna de días de mora directa del excel
        homologated["DiasMora"] = pd.to_numeric(df["DIAS MORA"], errors="coerce").fillna(0.0).astype(int)
        
        return homologated
    except Exception as e:
        print("Error parseando Excel real:", str(e))
        return None

def generate_mock_data():
    """Genera datos simulados realistas si el Excel real no está disponible."""
    random.seed(42)
    sectores = ["Construcción", "Industrial", "Distribución", "Ingeniería"]
    regiones = ["Bogotá", "Girardot", "Cali", "Medellín", "Bucaramanga", "Neiva"]
    
    clientes_list = [
        {"id": "CLI-101", "nombre": "Aceros del Alto Magdalena SAS", "sector": "Construcción", "region": "Girardot", "riesgo": "Medio"},
        {"id": "CLI-102", "nombre": "Ferretería El Progreso Central", "sector": "Distribución", "region": "Bogotá", "riesgo": "Bajo"},
        {"id": "CLI-103", "nombre": "Consorcio Vial de Occidente", "sector": "Ingeniería", "region": "Cali", "riesgo": "Alto"},
        {"id": "CLI-104", "nombre": "Metalúrgica Andina S.A.", "sector": "Industrial", "region": "Medellín", "riesgo": "Bajo"},
        {"id": "CLI-105", "nombre": "Constructoras Asociadas de Neiva", "sector": "Construcción", "region": "Neiva", "riesgo": "Medio"},
        {"id": "CLI-106", "nombre": "Distribuidora de Hierros Santander", "sector": "Distribución", "region": "Bucaramanga", "riesgo": "Bajo"},
        {"id": "CLI-107", "nombre": "Ingeniería y Diseños del Tolima", "sector": "Ingeniería", "region": "Girardot", "riesgo": "Alto"},
        {"id": "CLI-108", "nombre": "Estructuras Metálicas de la Sabana", "sector": "Industrial", "region": "Bogotá", "riesgo": "Medio"},
        {"id": "CLI-109", "nombre": "Concretos y Cimentaciones del Huila", "sector": "Construcción", "region": "Neiva", "riesgo": "Alto"},
        {"id": "CLI-110", "nombre": "Almacenes de Acero de Colombia", "sector": "Distribución", "region": "Bogotá", "riesgo": "Bajo"}
    ]
    
    today = datetime.now()
    data = []
    
    for i in range(120):
        factura_id = f"FAC-{20000 + i}"
        cliente = random.choice(clientes_list)
        dias_atras = random.randint(15, 200)
        fecha_emision = today - timedelta(days=dias_atras)
        
        plazo = random.choice([30, 45, 60])
        fecha_vencimiento = fecha_emision + timedelta(days=plazo)
        monto_facturado = round(random.uniform(5000000, 45000000), -4)
        
        esta_pagada = random.random() < 0.70
        if esta_pagada:
            dias_pago = random.randint(-5, 45)
            fecha_pago = fecha_vencimiento + timedelta(days=dias_pago)
            if fecha_pago > today:
                fecha_pago = today - timedelta(days=1)
            saldo = 0.0
            monto_recaudado = monto_facturado
        else:
            fecha_pago = None
            monto_recaudado = 0.0
            saldo = monto_facturado
            
        ventas_credito = monto_facturado * 1.5
        
        data.append({
            "FacturaID": factura_id,
            "ClienteID": cliente["id"],
            "ClienteNombre": cliente["nombre"],
            "Sector": cliente["sector"],
            "Region": cliente["region"],
            "Riesgo": cliente["riesgo"],
            "FechaFactura": fecha_emision.strftime("%Y-%m-%d"),
            "FechaVencimiento": fecha_vencimiento.strftime("%Y-%m-%d"),
            "FechaPago": fecha_pago.strftime("%Y-%m-%d") if fecha_pago else "",
            "MontoFacturado": monto_facturado,
            "MontoRecaudado": monto_recaudado,
            "Saldo": saldo,
            "TasaCostoOportunidad": 0.12,
            "VentasCredito": ventas_credito
        })
        
    df = pd.DataFrame(data)
    df.to_csv(os.path.join(DATA_DIR, "cartera_base.csv"), index=False, encoding="utf-8")
    return df

def get_data():
    """Obtiene el conjunto de datos de trabajo actual. Carga datos base por defecto."""
    global CURRENT_DATA
    if CURRENT_DATA is not None:
        return CURRENT_DATA
        
    real_data = load_and_parse_real_excel()
    if real_data is not None:
        CURRENT_DATA = real_data
        return CURRENT_DATA
        
    # Intentar leer cartera_base.csv local/persistida
    base_file = os.path.join(DATA_DIR, "cartera_base.csv")
    if os.path.exists(base_file):
        try:
            CURRENT_DATA = pd.read_csv(base_file, encoding="utf-8")
            return CURRENT_DATA
        except Exception:
            pass
            
    # Si no hay datos, generar datos de demostración automáticos (Ideal para Vercel)
    CURRENT_DATA = generate_mock_data()
    return CURRENT_DATA

def get_filtered_data():
    """Retorna el DataFrame activo filtrado de acuerdo con los dropdowns del dashboard."""
    df = get_data().copy()
    
    # Soportar compatibilidad de nombres de columna
    if "UnidadNegocio" not in df.columns and "Region" in df.columns:
        df["UnidadNegocio"] = df["Region"]
    if "Moneda" not in df.columns:
        df["Moneda"] = "USD"
        
    # Filtro por Filial (Unidad de Negocio)
    filial = request.args.get("filial", "").strip()
    if filial and filial != "Todos":
        df = df[df["UnidadNegocio"] == filial]
        
    # Filtro por Moneda
    moneda = request.args.get("moneda", "").strip()
    if moneda and moneda != "Todos":
        df = df[df["Moneda"] == moneda]
        
    return df

def process_etl(df):
    """Ejecuta el pipeline ETL para estructurar los datos en un Modelo Estrella."""
    df_copy = df.copy()
    df_copy["MontoFacturado"] = pd.to_numeric(df_copy["MontoFacturado"], errors="coerce").fillna(0.0)
    df_copy["MontoRecaudado"] = pd.to_numeric(df_copy["MontoRecaudado"], errors="coerce").fillna(0.0)
    df_copy["Saldo"] = pd.to_numeric(df_copy["Saldo"], errors="coerce").fillna(0.0)
    df_copy["VentasCredito"] = pd.to_numeric(df_copy["VentasCredito"], errors="coerce").fillna(df_copy["MontoFacturado"] * 1.5)
    
    df_copy["FechaFactura"] = pd.to_datetime(df_copy["FechaFactura"], errors="coerce")
    df_copy["FechaVencimiento"] = pd.to_datetime(df_copy["FechaVencimiento"], errors="coerce")
    df_copy["FechaPago"] = pd.to_datetime(df_copy["FechaPago"], errors="coerce")
    
    today = pd.to_datetime(datetime.now().strftime("%Y-%m-%d"))
    
    # Si DiasMora no está precalculado en el dataframe, calcularlo
    if "DiasMora" not in df_copy.columns:
        dias_mora_list = []
        for idx, row in df_copy.iterrows():
            if row["Saldo"] > 0 and today > row["FechaVencimiento"]:
                dias_mora_list.append((today - row["FechaVencimiento"]).days)
            else:
                dias_mora_list.append(0)
        df_copy["DiasMora"] = dias_mora_list
        
    # Clasificación de Tramos de Mora
    def clasificar_tramo(mora):
        if mora == 0:
            return "Al día"
        elif 1 <= mora <= 30:
            return "1 - 30 días"
        elif 31 <= mora <= 60:
            return "31 - 60 días"
        elif 61 <= mora <= 90:
            return "61 - 90 días"
        else:
            return "Más de 90 días"
            
    df_copy["TramoMora"] = df_copy["DiasMora"].apply(clasificar_tramo)
    
    # Días transcurridos reales para pagar
    dias_para_pagar_list = []
    for idx, row in df_copy.iterrows():
        if pd.notna(row["FechaPago"]):
            dias_para_pagar_list.append((row["FechaPago"] - row["FechaFactura"]).days)
        else:
            dias_para_pagar_list.append(None)
    df_copy["DiasParaPagar"] = dias_para_pagar_list
    
    # 1. Dimensión Clientes
    dim_clientes_cols = ["ClienteID", "ClienteNombre", "Sector", "Region", "Riesgo"]
    if "UnidadNegocio" in df_copy.columns:
        dim_clientes_cols.append("UnidadNegocio")
    dim_clientes = df_copy[dim_clientes_cols].drop_duplicates().reset_index(drop=True)
    
    # 2. Dimensión Fechas
    min_date = df_copy["FechaFactura"].min()
    max_date = max(df_copy["FechaFactura"].max(), df_copy["FechaVencimiento"].max(), today)
    if pd.isna(min_date):
        min_date = today - timedelta(days=365)
    if pd.isna(max_date):
        max_date = today
        
    date_range = pd.date_range(start=min_date, end=max_date, freq='D')
    dim_fechas = pd.DataFrame({
        "DateKey": date_range.strftime("%Y%m%d").astype(int),
        "Fecha": date_range,
        "Año": date_range.year,
        "MesNum": date_range.month,
        "MesNombre": date_range.strftime("%B"),
        "Trimestre": "Trimestre " + date_range.quarter.astype(str),
        "DiaSemana": date_range.strftime("%A")
    })
    
    traducciones_meses = {
        "January": "Enero", "February": "Febrero", "March": "Marzo", "April": "Abril",
        "May": "Mayo", "June": "Junio", "July": "Julio", "August": "Agosto",
        "September": "Septiembre", "October": "Octubre", "November": "Noviembre", "December": "Diciembre"
    }
    dim_fechas["MesNombre"] = dim_fechas["MesNombre"].map(traducciones_meses).fillna(dim_fechas["MesNombre"])
    
    # 3. Hechos Cartera
    df_copy["FechaFacturaKey"] = df_copy["FechaFactura"].dt.strftime("%Y%m%d").fillna("0").astype(int)
    df_copy["FechaVencimientoKey"] = df_copy["FechaVencimiento"].dt.strftime("%Y%m%d").fillna("0").astype(int)
    df_copy["FechaPagoKey"] = df_copy["FechaPago"].dt.strftime("%Y%m%d").fillna("-1")
    df_copy["FechaPagoKey"] = df_copy["FechaPagoKey"].replace({"": "-1", "NaT": "-1", "-1": -1}).astype(int)
    
    fact_cols = [
        "FacturaID", "ClienteID", "FechaFacturaKey", "FechaVencimientoKey", "FechaPagoKey",
        "MontoFacturado", "MontoRecaudado", "Saldo", "DiasMora", "TramoMora", 
        "DiasParaPagar", "TasaCostoOportunidad", "VentasCredito"
    ]
    if "Moneda" in df_copy.columns:
        fact_cols.append("Moneda")
    if "UnidadNegocio" in df_copy.columns:
        fact_cols.append("UnidadNegocio")
        
    fact_cartera = df_copy[fact_cols].copy()
    
    return fact_cartera, dim_clientes, dim_fechas

def calculate_metrics(df):
    """Calcula los 6 KPIs financieros en base al dataframe de trabajo."""
    fact_cartera, dim_clientes, dim_fechas = process_etl(df)
    
    cartera_total = float(fact_cartera["Saldo"].sum())
    cartera_vencida = float(fact_cartera.loc[fact_cartera["DiasMora"] > 0, "Saldo"].sum())
    
    total_facturado = fact_cartera["MontoFacturado"].sum()
    total_recaudado = fact_cartera["MontoRecaudado"].sum()
    indice_recuperacion = float((total_recaudado / total_facturado * 100) if total_facturado > 0 else 0.0)
    
    ventas_totales = fact_cartera["VentasCredito"].sum()
    saldo_promedio = fact_cartera["Saldo"].mean()
    rotacion_cartera = float((ventas_totales / saldo_promedio) if saldo_promedio > 0 else 0.0)
    dso = float((365 / rotacion_cartera) if rotacion_cartera > 0 else 0.0)
    
    dias_cobro_reales = float(fact_cartera["DiasParaPagar"].dropna().mean()) if len(fact_cartera["DiasParaPagar"].dropna()) > 0 else 0.0
    
    costo_mora = 0.0
    for idx, row in fact_cartera[fact_cartera["DiasMora"] > 0].iterrows():
        costo_mora += row["Saldo"] * (row["DiasMora"] / 365) * row["TasaCostoOportunidad"]
    costo_mora = float(costo_mora)
    
    return {
        "cartera_total": cartera_total,
        "cartera_vencida": cartera_vencida,
        "indice_recuperacion": round(indice_recuperacion, 2),
        "rotacion_cartera": round(rotacion_cartera, 2),
        "dso": round(dso, 1),
        "dias_cobro_reales": round(dias_cobro_reales, 1),
        "costo_mora": round(costo_mora, 0)
    }

@app.route("/")
def home():
    """Renderiza el template principal."""
    return render_template("index.html")

@app.route("/api/filters/options")
def get_filter_options():
    """Retorna las opciones disponibles de Filial y Moneda en el DataFrame actual."""
    df = get_data().copy()
    if "UnidadNegocio" not in df.columns and "Region" in df.columns:
        df["UnidadNegocio"] = df["Region"]
    if "Moneda" not in df.columns:
        df["Moneda"] = "USD"
        
    filiales = sorted(df["UnidadNegocio"].dropna().unique().tolist())
    monedas = sorted(df["Moneda"].dropna().unique().tolist())
    
    return jsonify({
        "filiales": filiales,
        "monedas": monedas
    })

@app.route("/api/map/filiales")
def get_map_filiales():
    """Retorna métricas consolidadas por filial para el mapa de Leaflet."""
    df = get_data().copy()
    
    # Filtrar solo por moneda si se solicita, pero dejar ver todas las filiales
    moneda = request.args.get("moneda", "").strip()
    if moneda and moneda != "Todos":
        df = df[df["Moneda"] == moneda]
        
    if "UnidadNegocio" not in df.columns and "Region" in df.columns:
        df["UnidadNegocio"] = df["Region"]
        
    grouped = df.groupby("UnidadNegocio")
    map_data = []
    
    for filial_id, group in grouped:
        cartera_total = float(group["Saldo"].sum())
        
        # Calcular mora
        if "DiasMora" in group.columns:
            cartera_vencida = float(group.loc[group["DiasMora"] > 0, "Saldo"].sum())
        else:
            today = pd.to_datetime(datetime.now().strftime("%Y-%m-%d"))
            vcto = pd.to_datetime(group["FechaVencimiento"], errors="coerce")
            dias_mora = (today - vcto).dt.days.fillna(0)
            cartera_vencida = float(group.loc[(dias_mora > 0) & (group["Saldo"] > 0), "Saldo"].sum())
            
        morosidad = (cartera_vencida / cartera_total * 100) if cartera_total > 0 else 0.0
        coords = FILIAL_COORDINATES.get(filial_id, {"lat": 0.0, "lng": 0.0, "name": filial_id})
        
        map_data.append({
            "id": filial_id,
            "name": coords["name"],
            "lat": coords["lat"],
            "lng": coords["lng"],
            "cartera_total": round(cartera_total, 2),
            "cartera_vencida": round(cartera_vencida, 2),
            "morosidad": round(morosidad, 1),
            "num_clientes": int(group["ClienteID"].nunique())
        })
        
    return jsonify(map_data)

@app.route("/api/kpis")
def get_kpis():
    """Retorna KPIs filtrados para las tarjetas principales."""
    df = get_filtered_data()
    metrics = calculate_metrics(df)
    return jsonify(metrics)

@app.route("/api/charts/mora")
def get_chart_mora():
    """Agregación de mora filtrada por tramos."""
    df = get_filtered_data()
    fact_cartera, _, _ = process_etl(df)
    
    mora_agg = fact_cartera.groupby("TramoMora")["Saldo"].sum().reset_index()
    
    order = ["Al día", "1 - 30 días", "31 - 60 días", "61 - 90 días", "Más de 90 días"]
    mora_agg["TramoMora"] = pd.Categorical(mora_agg["TramoMora"], categories=order, ordered=True)
    mora_agg = mora_agg.sort_values("TramoMora").reset_index(drop=True)
    
    return jsonify({
        "labels": mora_agg["TramoMora"].tolist(),
        "values": mora_agg["Saldo"].tolist()
    })

@app.route("/api/charts/clientes")
def get_chart_clientes():
    """Retorna top 10 clientes críticos filtrados."""
    df = get_filtered_data()
    fact_cartera, dim_clientes, _ = process_etl(df)
    
    merged = pd.merge(fact_cartera, dim_clientes, on="ClienteID")
    client_agg = merged[merged["DiasMora"] > 0].groupby("ClienteNombre")["Saldo"].sum().reset_index()
    client_agg = client_agg.sort_values(by="Saldo", ascending=False).head(10)
    
    return jsonify({
        "labels": client_agg["ClienteNombre"].tolist(),
        "values": client_agg["Saldo"].tolist()
    })

@app.route("/api/charts/sectores")
def get_chart_sectores():
    """Agregación sectorial filtrada."""
    df = get_filtered_data()
    fact_cartera, dim_clientes, _ = process_etl(df)
    
    merged = pd.merge(fact_cartera, dim_clientes, on="ClienteID")
    sector_agg = merged.groupby("Sector")["Saldo"].sum().reset_index()
    
    return jsonify({
        "labels": sector_agg["Sector"].tolist(),
        "values": sector_agg["Saldo"].tolist()
    })

@app.route("/api/charts/riesgo")
def get_chart_riesgo():
    """Agregación de saldos por clasificación de riesgo financiero (A, B, C, D, E)."""
    df = get_filtered_data()
    if df.empty:
        return jsonify({
            "labels": [
                "Cat. A (Sin Mora)", 
                "Cat. B (Riesgo Bajo 1-30d)", 
                "Cat. C (Riesgo Medio 31-60d)", 
                "Cat. D (Riesgo Alto 61-90d)", 
                "Cat. E (Riesgo Crítico >90d)"
            ],
            "values": [0.0, 0.0, 0.0, 0.0, 0.0]
        })
    
    fact_cartera, _, _ = process_etl(df)
    
    # Clasificación
    saldos = {
        "A": 0.0,
        "B": 0.0,
        "C": 0.0,
        "D": 0.0,
        "E": 0.0
    }
    
    for _, row in fact_cartera.iterrows():
        dm = row["DiasMora"]
        saldo = row["Saldo"]
        if dm <= 0:
            saldos["A"] += saldo
        elif dm <= 30:
            saldos["B"] += saldo
        elif dm <= 60:
            saldos["C"] += saldo
        elif dm <= 90:
            saldos["D"] += saldo
        else:
            saldos["E"] += saldo
            
    return jsonify({
        "labels": [
            "Cat. A (Sin Mora)", 
            "Cat. B (Riesgo Bajo 1-30d)", 
            "Cat. C (Riesgo Medio 31-60d)", 
            "Cat. D (Riesgo Alto 61-90d)", 
            "Cat. E (Riesgo Crítico >90d)"
        ],
        "values": [saldos["A"], saldos["B"], saldos["C"], saldos["D"], saldos["E"]]
    })

@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Procesa una subida manual de datos (soporta homologación inteligente)."""
    global CURRENT_DATA
    if "file" not in request.files:
        return jsonify({"error": "No se cargó ningún archivo"}), 400
        
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Archivo no seleccionado"}), 400
        
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(file, encoding="utf-8")
        elif file.filename.endswith((".xlsx", ".xls")):
            # Intentar detectar la hoja 'CARTERA TOTAL' si está disponible
            xl = pd.ExcelFile(file)
            sheet = "CARTERA TOTAL" if "CARTERA TOTAL" in xl.sheet_names else xl.sheet_names[0]
            df = xl.parse(sheet)
        else:
            return jsonify({"error": "Formato no soportado. Suba un .xlsx, .xls o .csv"}), 400
            
        # Limpiar espacios en los nombres de columnas para robustez
        df.columns = df.columns.astype(str).str.strip()
        
        # Comprobar si es el Excel real de filiales
        is_real_excel = False
        if "FACTURA" in df.columns and "NIT" in df.columns and "CLIENTE" in df.columns:
            is_real_excel = True
            
        if is_real_excel:
            homologated = pd.DataFrame()
            homologated["FacturaID"] = df["FACTURA"].fillna("S/N").astype(str).str.replace(".0", "", regex=False)
            homologated["ClienteID"] = df["NIT"].fillna("S/D").astype(str).str.replace(".0", "", regex=False)
            homologated["ClienteNombre"] = df["CLIENTE"].fillna("Cliente Desconocido").astype(str)
            homologated["UnidadNegocio"] = df["UNIDAD NEGOCIO"].fillna("S/F").astype(str)
            homologated["Moneda"] = df["MONEDA"].fillna("USD").astype(str)
            
            # Usar Unidad Técnica y Servicio como descriptores
            homologated["Sector"] = df["UNIDAD TÉCNICA"].fillna("General").astype(str)
            homologated["Region"] = df["UNIDAD NEGOCIO"].fillna("Internacional").astype(str)
            
            # Fechas
            homologated["FechaFactura"] = pd.to_datetime(df["FECHA FACTURA"], errors="coerce").dt.strftime("%Y-%m-%d")
            homologated["FechaVencimiento"] = pd.to_datetime(df["FECHA VCTO"], errors="coerce").dt.strftime("%Y-%m-%d")
            homologated["FechaPago"] = ""
            
            # Saldo en Dólares
            homologated["Saldo"] = pd.to_numeric(df["SALDO PENDIENTE EN DOLARES"], errors="coerce").fillna(0.0)
            saldo_local = pd.to_numeric(df["SALDO PENDIENTE MONEDA LOCAL"], errors="coerce").fillna(0.0)
            monto_original_local = pd.to_numeric(df["MONTO ORIGINAL"], errors="coerce").fillna(0.0)
            
            # Replicar el cálculo de MontoFacturado USD exacto de load_and_parse_real_excel
            monto_original_usd = []
            for idx, row in df.iterrows():
                m_local = monto_original_local.iloc[idx]
                s_usd = homologated["Saldo"].iloc[idx]
                s_local = saldo_local.iloc[idx]
                if s_usd > 0 and s_local > 0:
                    tasa = s_local / s_usd
                    m_usd = m_local / tasa
                else:
                    m_usd = s_usd
                monto_original_usd.append(m_usd)
                
            homologated["MontoFacturado"] = monto_original_usd
            homologated["MontoRecaudado"] = homologated["MontoFacturado"] - homologated["Saldo"]
            
            # Parámetros adicionales
            homologated["TasaCostoOportunidad"] = 0.12
            homologated["VentasCredito"] = homologated["MontoFacturado"] * 1.5
            homologated["Riesgo"] = "Medio"
            homologated["DiasMora"] = pd.to_numeric(df["DIAS MORA"], errors="coerce").fillna(0.0).astype(int)
            
            df = homologated
        else:
            # Procesador genérico robusto
            required_cols = ["FacturaID", "ClienteID", "ClienteNombre", "FechaFactura", "FechaVencimiento", "MontoFacturado", "Saldo"]
            cols_map = {}
            for c in df.columns:
                c_upper = c.upper().strip().replace(" ", "").replace("_", "")
                
                # 1. Fechas (Evitar que FECHA FACTURA o FECHA VCTO se mapeen como IDs)
                if "FECHA" in c_upper:
                    if "FAC" in c_upper or "EMI" in c_upper:
                        cols_map[c] = "FechaFactura"
                    elif "VCTO" in c_upper or "VEN" in c_upper:
                        cols_map[c] = "FechaVencimiento"
                    elif "PAG" in c_upper:
                        cols_map[c] = "FechaPago"
                # 2. Identificadores que no contengan FECHA
                elif "FACTURA" in c_upper or "DCTO" in c_upper or "DOC" in c_upper:
                    cols_map[c] = "FacturaID"
                elif "NIT" in c_upper or ("CLIENTE" in c_upper and "ID" in c_upper):
                    cols_map[c] = "ClienteID"
                elif "CLIENTE" in c_upper:
                    cols_map[c] = "ClienteNombre"
                # 3. Montos
                elif "MONTOORIGINAL" in c_upper or "FACTURADO" in c_upper:
                    cols_map[c] = "MontoFacturado"
                # 4. Saldo (Evitar colisión de Saldo Local vs Saldo Dólares)
                elif "SALDO" in c_upper and "DOL" in c_upper:
                    cols_map[c] = "Saldo"
                elif "SALDO" in c_upper and "LOC" in c_upper:
                    cols_map[c] = "SaldoLocal"
                elif "SALDO" in c_upper:
                    cols_map[c] = "Saldo"
                    
            df = df.rename(columns=cols_map)
            
            # Completar campos faltantes
            if "UnidadNegocio" not in df.columns:
                orig_col = [c for c in df.columns if "UNIDAD" in c.upper() or "FILIAL" in c.upper()]
                df["UnidadNegocio"] = df[orig_col[0]] if orig_col else "General"
                
            if "Moneda" not in df.columns:
                orig_col = [c for c in df.columns if "MONEDA" in c.upper() or "DIVISA" in c.upper()]
                df["Moneda"] = df[orig_col[0]] if orig_col else "USD"
                
            if "Sector" not in df.columns:
                df["Sector"] = "General"
            if "Region" not in df.columns:
                df["Region"] = df["UnidadNegocio"]
            if "Riesgo" not in df.columns:
                df["Riesgo"] = "Medio"
            if "MontoRecaudado" not in df.columns:
                df["MontoRecaudado"] = df["MontoFacturado"] - df["Saldo"]
            if "TasaCostoOportunidad" not in df.columns:
                df["TasaCostoOportunidad"] = 0.12
            if "VentasCredito" not in df.columns:
                df["VentasCredito"] = df["MontoFacturado"] * 1.5
            if "FechaPago" not in df.columns:
                df["FechaPago"] = ""
            if "DiasMora" not in df.columns:
                orig_col = [c for c in df.columns if "MORA" in c.upper() and "DIAS" in c.upper()]
                if orig_col:
                    df["DiasMora"] = pd.to_numeric(df[orig_col[0]], errors="coerce").fillna(0).astype(int)
            
            # Validar columnas mínimas del formato genérico
            missing = [rc for rc in required_cols if rc not in df.columns]
            if missing:
                return jsonify({"error": f"Columnas faltantes en el archivo: {', '.join(missing)}"}), 400
                
        # Mantener solo columnas del modelo y preservar DiasMora si existe
        cols_to_keep = [
            "FacturaID", "ClienteID", "ClienteNombre", "Sector", "Region", "Riesgo", 
            "FechaFactura", "FechaVencimiento", "FechaPago", "MontoFacturado", 
            "MontoRecaudado", "Saldo", "TasaCostoOportunidad", "VentasCredito",
            "UnidadNegocio", "Moneda"
        ]
        if "DiasMora" in df.columns:
            cols_to_keep.append("DiasMora")
            
        df = df[cols_to_keep]
            
        df.to_csv(os.path.join(DATA_DIR, "cartera_base.csv"), index=False, encoding="utf-8")
        CURRENT_DATA = df
        
        return jsonify({"success": True, "message": "Datos de cartera internacional actualizados con éxito."})
        
    except Exception as e:
        return jsonify({"error": f"Error de lectura en archivo: {str(e)}"}), 500

@app.route("/api/export/star-schema")
def export_star_schema():
    """Exporta el Modelo Estrella relacional adaptado a Excel."""
    df = get_data()
    fact_cartera, dim_clientes, dim_fechas = process_etl(df)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        fact_cartera.to_excel(writer, sheet_name="FactCartera", index=False)
        dim_clientes.to_excel(writer, sheet_name="DimClientes", index=False)
        dim_fechas.to_excel(writer, sheet_name="DimFechas", index=False)
        
    output.seek(0)
    response = make_response(output.read())
    response.headers['Content-Disposition'] = "attachment; filename=ModeloEstrella_CarteraInternacional.xlsx"
    response.headers['Content-Type'] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    return response

@app.route("/api/reset")
def reset_data():
    """Reinicia el dataset activo a vacío."""
    global CURRENT_DATA
    CURRENT_DATA = None
    # Eliminar cartera_base.csv si existe para asegurar un borrado completo del disco también
    base_file = os.path.join(DATA_DIR, "cartera_base.csv")
    if os.path.exists(base_file):
        try:
            os.remove(base_file)
        except Exception:
            pass
    return jsonify({"success": True, "message": "Base de datos y caché de cartera vaciadas por completo."})

if __name__ == "__main__":
    print("Iniciando Servidor de Cartera Internacional en http://localhost:5000")
    app.run(debug=True, port=5000)
