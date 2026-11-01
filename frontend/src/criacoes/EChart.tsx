/** ECharts tree-shaken (só o que o painel usa) — carregado apenas na rota lazy "Criações da IA". */
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

export function EChart({ option, height = 360 }: { option: EChartsCoreOption; height?: number }) {
  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge={false} lazyUpdate />;
}
