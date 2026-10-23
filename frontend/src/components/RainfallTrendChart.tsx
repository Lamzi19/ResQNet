import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, ComposedChart, Line, ReferenceLine
} from 'recharts';
import { BarChart3, Clock, Database } from 'lucide-react';
import type { HourlyTrendPoint } from '../services/api';

interface RainfallTrendChartProps {
  trend: HourlyTrendPoint[];
  locationName: string;
}

export const RainfallTrendChart: React.FC<RainfallTrendChartProps> = ({ trend = [], locationName }) => {
  // Format timestamps and partition observed vs forecast precipitation
  const { formattedData, nowLabel } = React.useMemo(() => {
    if (!trend || trend.length === 0) return { formattedData: [], nowLabel: '' };

    let firstForecastLabel = '';

    const data = trend.map((point, index) => {
      const d = new Date(point.time);
      const hours = d.getHours().toString().padStart(2, '0') + ':00';
      const day = d.getDate();
      const month = d.toLocaleString('en-US', { month: 'short' });
      const displayTime = `${month} ${day}, ${hours}`;

      const isForecast = point.is_forecast ?? (index >= 24);

      if (isForecast && !firstForecastLabel) {
        firstForecastLabel = displayTime;
      }

      return {
        ...point,
        displayTime,
        timeShort: hours,
        isForecast,
        // Separate historical observations from forecast series for clear visual distinction
        observed_precip_mm: isForecast ? null : point.precipitation_mm,
        forecast_precip_mm: isForecast ? point.precipitation_mm : null,
      };
    });

    return { formattedData: data, nowLabel: firstForecastLabel };
  }, [trend]);

  if (!trend || trend.length === 0) {
    return (
      <div className="dash-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No hourly rainfall telemetry available for this station.
      </div>
    );
  }

  return (
    <div className="dash-card" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            <BarChart3 size={16} color="var(--brand-teal)" />
            Hydrometeorological Timeline (Observed & 48h Forecast)
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Rainfall rate (mm/hr) & topsoil saturation profile for {locationName || 'selected district'}
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', backgroundColor: '#0F9D9A', borderRadius: '2px' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Observed Rain</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', backgroundColor: '#60A5FA', border: '1px dashed #2563EB', borderRadius: '2px' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Forecast Rain</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '12px', height: '3px', backgroundColor: '#16845B' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Soil Saturation</span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: '360px', flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={formattedData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis 
              dataKey="displayTime" 
              stroke="#64748B" 
              fontSize={10} 
              tickLine={false}
              interval={Math.max(1, Math.floor(formattedData.length / 8))}
              angle={-15}
              textAnchor="end"
              height={35}
            />
            <YAxis 
              yAxisId="rain"
              orientation="left"
              stroke="#64748B" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v} mm`}
            />
            <YAxis 
              yAxisId="soil"
              orientation="right"
              stroke="#64748B" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
            {nowLabel && (
              <ReferenceLine 
                yAxisId="rain"
                x={nowLabel} 
                stroke="#D99A16" 
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{ 
                  value: 'Observed / Forecast Boundary', 
                  position: 'insideTopLeft', 
                  fill: '#B45309', 
                  fontSize: 10,
                  fontWeight: 600,
                  offset: 8
                }} 
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      boxShadow: '0 4px 12px rgba(16, 27, 45, 0.1)',
                      fontSize: '12px'
                    }}>
                      <div style={{ fontWeight: 700, color: '#172B4D', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '11px', color: data.isForecast ? '#2563EB' : '#0F9D9A', marginBottom: '6px' }}>
                        ● {data.isForecast ? 'Forecast Projection (ECMWF)' : 'Past Observed Observation'}
                      </div>
                      <div style={{ color: '#0F9D9A', marginBottom: '2px' }}>
                        Rainfall: <strong>{data.precipitation_mm} mm/h</strong>
                      </div>
                      <div style={{ color: '#16845B' }}>
                        Topsoil Moisture: <strong>{(data.soil_moisture * 100).toFixed(0)}%</strong>
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748B', marginTop: '6px', borderTop: '1px solid #F1F5F9', paddingTop: '4px' }}>
                        Hourly physical reading • Zero synthetic padding
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* Historical Observed Series */}
            <Bar 
              yAxisId="rain" 
              dataKey="observed_precip_mm" 
              name="Observed Rain"
              fill="#0F9D9A" 
              radius={[3, 3, 0, 0]} 
              maxBarSize={14}
            />
            {/* Forecast Projection Series */}
            <Bar 
              yAxisId="rain" 
              dataKey="forecast_precip_mm" 
              name="Forecast Rain"
              fill="#93C5FD"
              stroke="#3B82F6"
              strokeDasharray="2 2"
              radius={[3, 3, 0, 0]} 
              maxBarSize={14}
            />
            <Line 
              yAxisId="soil" 
              type="monotone" 
              dataKey="soil_moisture" 
              name="Soil Moisture"
              stroke="#16845B" 
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Provenance and Timestamps Footer */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        borderTop: '1px solid var(--border-light)', 
        paddingTop: '8px', 
        marginTop: '8px', 
        fontSize: '0.72rem', 
        color: 'var(--text-muted)',
        flexWrap: 'wrap',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Database size={12} color="var(--brand-teal)" />
          <span>Source: ECMWF IFS Global Forecast & Open-Meteo Historical Reanalysis</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Clock size={12} />
          <span>Timeline: -24h Historical to +48h Forward (Hourly Resolution)</span>
        </div>
      </div>
    </div>
  );
};

