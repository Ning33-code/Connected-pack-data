(function () {
  "use strict";

  const R = "F40009";
  const K = "1B1B1F";
  const G = "E8A33D";
  const M = "6B7280";
  const L = "E5E7EB";
  const W = "FFFFFF";
  const F = "Microsoft YaHei";

  function short(value, max) {
    const text = String(value || "");
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function chartName(value) {
    return String(value || "").replace(/^Y\d+\s*/i, "");
  }

  function big(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " 亿";
    if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(1).replace(/\.0$/, "") + " 万";
    return Math.round(value).toLocaleString();
  }

  function pct(value) {
    return value == null || !Number.isFinite(value) ? "—" : (value * 100).toFixed(1) + "%";
  }

  function pp(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    return (value >= 0 ? "+" : "") + (value * 100).toFixed(1) + " pp";
  }

  function buildEditablePPTXV2() {
    if (typeof PptxGenJS === "undefined") throw new Error("PPTX 组件未加载，请检查网络后刷新");

    const D = pptData();
    const bottle = D.bottle.map((x) => ({
      name: x.name,
      pv: x.value,
      share: x.share,
      cpRate: x.partCp,
      othRate: x.partOth,
    }));
    const utc = D.utc.map((x) => ({ name: x.name, scans: x.value }));
    const cp = D.cp;
    const scan = D.scan;
    const total = D.total;
    const overall = D.overall;
    const avgLead = D.avgLead;
    const topBottle = bottle.filter((x) => x.pv != null).sort((a, b) => b.pv - a.pv)[0];
    const year = String(D.date || "").slice(0, 4) || "2026";

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Connected Pack Dashboard";
    pptx.company = "Coca-Cola";
    pptx.subject = "Connected Pack 流量汇报";
    pptx.title = "Connected Pack 流量汇报 · " + D.date;
    pptx.lang = "zh-CN";
    pptx.theme = {
      headFontFace: F,
      bodyFontFace: F,
      lang: "zh-CN",
    };

    const S = pptx.ShapeType;
    const T = pptx.ChartType;
    const addText = (slide, text, options) =>
      slide.addText(String(text), Object.assign({
        fontFace: F,
        color: K,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      }, options || {}));
    const addLine = (slide, x, y, width) =>
      slide.addShape(S.line, { x, y, w: width, h: 0, line: { color: L, pt: 1 } });
    const header = (slide, kicker, title) => {
      slide.background = { color: W };
      slide.addShape(S.rect, { x: 0, y: 0, w: 13.333, h: 0.12, line: { color: R, transparency: 100 }, fill: { color: R } });
      addText(slide, kicker, { x: 0.62, y: 0.3, w: 5.6, h: 0.24, fontSize: 16, bold: true, color: R, charSpacing: 1 });
      addText(slide, title, { x: 0.62, y: 0.65, w: 12.05, h: 0.55, fontSize: 35, bold: true });
      addLine(slide, 0.62, 1.3, 12.05);
    };
    const footer = (slide, page) => {
      addText(slide, "Connected Pack · 数据截至 " + D.date, { x: 0.62, y: 7.12, w: 5.2, h: 0.18, fontSize: 10, color: "8FA2BC" });
      addText(slide, String(page).padStart(2, "0"), { x: 12.1, y: 7.08, w: 0.55, h: 0.2, fontSize: 10, color: "8FA2BC", align: "right" });
    };

    // 01 封面
    {
      const slide = pptx.addSlide();
      slide.background = { color: K };
      slide.addShape(S.rect, { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: R, transparency: 100 }, fill: { color: R } });
      addText(slide, "CONNECTED PACK", { x: 0.72, y: 1.38, w: 4.5, h: 0.28, fontSize: 18, bold: true, color: G, charSpacing: 1.6 });
      addText(slide, "流量表现与活动洞察", { x: 0.72, y: 1.85, w: 10.8, h: 0.78, fontSize: 46, bold: true, color: W });
      slide.addShape(S.line, { x: 0.72, y: 3.85, w: 2.08, h: 0, line: { color: G, pt: 2 } });
      addText(slide, "数据截至 " + D.date, { x: 0.72, y: 4.12, w: 4.4, h: 0.32, fontSize: 18, bold: true, color: W });
    }

    // 02 总览：左 UTC / 右瓶身码
    {
      const slide = pptx.addSlide();
      header(slide, "OVERVIEW", year + "年 Connected Pack 累计流量达 " + big(total));
      slide.addShape(S.line, { x: 6.65, y: 1.68, w: 0, h: 4.52, line: { color: L, pt: 1 } });

      addText(slide, "UTC 表现", { x: 0.78, y: 1.72, w: 4.7, h: 0.3, fontSize: 22, bold: true, color: G });
      addText(slide, "累计扫盖次数", { x: 0.78, y: 2.28, w: 2.0, h: 0.24, fontSize: 15, bold: true, color: M });
      addText(slide, big(scan), { x: 0.78, y: 2.62, w: 3.0, h: 0.58, fontSize: 36, bold: true, color: G });
      addText(slide, "贡献总流量 " + pct(total > 0 ? scan / total : null), { x: 0.78, y: 3.55, w: 2.8, h: 0.32, fontSize: 20, bold: true });
      slide.addChart(T.doughnut, [{ name: "流量构成", labels: ["瓶身码", "UTC"], values: total > 0 ? [cp, scan] : [1, 0] }], {
        x: 3.28, y: 2.04, w: 2.65, h: 2.75,
        holeSize: 70, showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 11,
        showPercent: true, showValue: false, dataLabelPosition: "bestFit",
        dataLabelColor: K, dataLabelFontFace: F, dataLabelFontSize: 11,
        chartColors: [R, G], showTitle: false, showBorder: false,
      });
      addLine(slide, 0.78, 5.1, 5.15);
      addText(slide, utc.filter((x) => x.scans != null).sort((a, b) => b.scans - a.scans).map((x) => short(x.name, 14) + "  " + big(x.scans)).join("    "), {
        x: 0.78, y: 5.38, w: 5.15, h: 0.34, fontSize: 16, bold: true, color: M,
      });

      addText(slide, "瓶身码表现", { x: 7.18, y: 1.72, w: 4.6, h: 0.3, fontSize: 22, bold: true, color: R });
      addText(slide, "整体流量", { x: 7.18, y: 2.28, w: 1.8, h: 0.24, fontSize: 15, bold: true, color: M });
      addText(slide, big(cp), { x: 7.18, y: 2.62, w: 3.2, h: 0.58, fontSize: 36, bold: true, color: R });
      addText(slide, "瓶身码流量占比", { x: 7.18, y: 3.62, w: 2.1, h: 0.24, fontSize: 15, bold: true, color: M });
      addText(slide, pct(overall), { x: 7.18, y: 3.94, w: 1.9, h: 0.5, fontSize: 30, bold: true });
      addText(slide, "TOP 活动", { x: 9.84, y: 3.62, w: 1.5, h: 0.24, fontSize: 15, bold: true, color: M });
      addText(slide, topBottle ? short(topBottle.name, 20) : "—", { x: 9.84, y: 3.94, w: 2.5, h: 0.32, fontSize: 19, bold: true });
      addText(slide, topBottle ? big(topBottle.pv) : "—", { x: 9.84, y: 4.38, w: 2.2, h: 0.24, fontSize: 15, bold: true, color: R });
      addLine(slide, 7.18, 5.1, 5.4);
      addText(slide, avgLead == null ? "互动率暂无完整数据" : "互动率平均领先其他渠道 " + pp(avgLead), {
        x: 7.18, y: 5.38, w: 5.4, h: 0.34, fontSize: 20, bold: true,
        color: avgLead != null && avgLead >= 0 ? R : M,
      });
      footer(slide, 2);
    }

    // 03 瓶身码流量：PV 柱状图 + 瓶身码占比折线
    {
      const slide = pptx.addSlide();
      const rows = bottle.filter((x) => x.pv != null && x.share != null).sort((a, b) => b.pv - a.pv);
      const labels = rows.map((x) => chartName(x.name));
      header(slide, "CAMPAIGN TRAFFIC · LABEL CODE", year + "年 Label code 累计流量达 " + big(cp));
      if (rows.length) {
        slide.addChart([
          {
            type: T.bar,
            data: [{ name: "访问 PV", labels, values: rows.map((x) => x.pv) }],
            options: {
              barDir: "col", chartColors: [R], showValue: true, dataLabelPosition: "outEnd",
              dataLabelFormatCode: "#,##0", dataLabelColor: M, dataLabelFontFace: F, dataLabelFontSize: 9,
              secondaryValAxis: false, secondaryCatAxis: false,
            },
          },
          {
            type: T.line,
            data: [{ name: "瓶身码流量占比", labels, values: rows.map((x) => x.share) }],
            options: {
              chartColors: [G], lineSize: 3, showValue: true, dataLabelPosition: "t",
              dataLabelFormatCode: "0.0%", dataLabelColor: G, dataLabelFontFace: F, dataLabelFontSize: 9,
              secondaryValAxis: true, secondaryCatAxis: true,
            },
          },
        ], {
          x: 0.75, y: 1.58, w: 11.9, h: 4.92,
          showTitle: false, showLegend: true, legendPos: "t", legendFontFace: F, legendFontSize: 13,
          showBorder: false,
          catAxes: [
            { catAxisLabelFontFace: F, catAxisLabelFontSize: 11, catAxisLabelColor: M },
            { catAxisLabelFontFace: F, catAxisLabelFontSize: 1, catAxisLabelColor: W, showLabel: false, showTitle: false },
          ],
          valAxes: [
            { valAxisLabelFontFace: F, valAxisLabelFontSize: 10, valAxisLabelColor: M, valAxisLabelFormatCode: "0.0,,\"M\"", valGridLine: { color: "D1D5DB", pt: 1 } },
            { valAxisLabelFontFace: F, valAxisLabelFontSize: 10, valAxisLabelColor: G, valAxisLabelFormatCode: "0%", valAxisMinVal: 0, valAxisMaxVal: 1, valGridLine: { color: W, transparency: 100 } },
          ],
        });
      } else {
        addText(slide, "暂无瓶身码流量与占比数据", { x: 1, y: 3.35, w: 11.2, h: 0.5, fontSize: 24, color: M, align: "center" });
      }
      footer(slide, 3);
    }

    // 04 互动质量
    {
      const slide = pptx.addSlide();
      const rows = bottle.filter((x) => x.cpRate != null || x.othRate != null).sort((a, b) => (b.cpRate || 0) - (a.cpRate || 0));
      header(slide, "TRAFFIC QUALITY", avgLead == null ? "瓶身码互动质量表现" : "瓶身码互动率平均领先其他渠道 " + pp(avgLead));
      if (rows.length) {
        slide.addChart(T.bar, [
          { name: "瓶身码互动率", labels: rows.map((x) => short(x.name, 20)), values: rows.map((x) => x.cpRate || 0) },
          { name: "其他渠道互动率", labels: rows.map((x) => short(x.name, 20)), values: rows.map((x) => x.othRate || 0) },
        ], {
          x: 1.32, y: 1.58, w: 10.5, h: 4.92,
          barDir: "bar", barGrouping: "clustered", showTitle: false, showLegend: true,
          legendPos: "b", legendFontFace: F, legendFontSize: 12,
          chartColors: [R, "666666"], showValue: false, showBorder: false,
          catAxisLabelFontFace: F, catAxisLabelFontSize: 12, catAxisLabelColor: M,
          valAxisLabelFontFace: F, valAxisLabelFontSize: 11, valAxisLabelColor: M,
          valAxisLabelFormatCode: "0%", valAxisMinVal: 0, valAxisMaxVal: 1,
          valGridLine: { color: "B4B4B4", pt: 1 },
        });
      } else {
        addText(slide, "暂无互动率数据", { x: 1, y: 3.35, w: 11.2, h: 0.5, fontSize: 24, color: M, align: "center" });
      }
      footer(slide, 4);
    }

    // 05 双平台 MAU 贡献
    {
      const slide = pptx.addSlide();
      const rows = (D.mau || []).filter((x) => (x.wx_mau > 0 && x.wx_label != null) || (x.ali_mau > 0 && x.ali_chunyue != null));
      header(slide, "MAU CONTRIBUTION", "瓶身码对双平台 MAU 的贡献");
      if (rows.length) {
        const labels = rows.map((x) => x.month);
        const wx = rows.map((x) => x.wx_mau > 0 && x.wx_label != null ? x.wx_label / x.wx_mau : 0);
        const ali = rows.map((x) => x.ali_mau > 0 && x.ali_chunyue != null ? x.ali_chunyue / x.ali_mau : 0);
        slide.addChart(T.line, [
          { name: "微信瓶身码贡献", labels, values: wx },
          { name: "支付宝纯悦贡献", labels, values: ali },
        ], {
          x: 0.85, y: 1.72, w: 7.9, h: 4.65,
          showTitle: false, showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 12,
          chartColors: [R, G], lineSize: 3, showValue: true,
          dataLabelFormatCode: "0.0%", dataLabelColor: M, dataLabelFontFace: F, dataLabelFontSize: 10,
          catAxisLabelFontFace: F, catAxisLabelFontSize: 11, catAxisLabelColor: M,
          valAxisLabelFontFace: F, valAxisLabelFontSize: 10, valAxisLabelColor: M,
          valAxisLabelFormatCode: "0.0%", valAxisMinVal: 0,
          valGridLine: { color: "B4B4B4", pt: 1 }, showBorder: false,
        });
        const latest = rows[rows.length - 1];
        const wxLatest = latest.wx_mau > 0 && latest.wx_label != null ? latest.wx_label / latest.wx_mau : null;
        const aliLatest = latest.ali_mau > 0 && latest.ali_chunyue != null ? latest.ali_chunyue / latest.ali_mau : null;
        addLine(slide, 9.42, 1.88, 2.62);
        addText(slide, "最新月份", { x: 9.5, y: 2.18, w: 2.8, h: 0.25, fontSize: 16, color: M, bold: true });
        addText(slide, latest.month, { x: 9.5, y: 2.58, w: 2.8, h: 0.55, fontSize: 32, bold: true });
        addText(slide, "微信贡献  " + pct(wxLatest), { x: 9.5, y: 3.48, w: 3.1, h: 0.34, fontSize: 20, bold: true, color: R });
        addText(slide, "支付宝贡献  " + pct(aliLatest), { x: 9.5, y: 4.18, w: 3.1, h: 0.34, fontSize: 20, bold: true, color: G });
      } else {
        addText(slide, "暂无 MAU 贡献数据", { x: 1, y: 3.35, w: 11.2, h: 0.5, fontSize: 24, color: M, align: "center" });
      }
      footer(slide, 5);
    }

    // 06 附录
    {
      const slide = pptx.addSlide();
      header(slide, "APPENDIX", "附录");
      const rows = [
        ["活动", "类型", "流量", "瓶身码占比", "瓶身码互动率", "其他互动率"],
      ].concat(
        bottle.map((x) => [short(x.name, 24), "瓶身码", x.pv == null ? "—" : Math.round(x.pv).toLocaleString(), pct(x.share), pct(x.cpRate), pct(x.othRate)]),
        utc.map((x) => [short(x.name, 24), "UTC", x.scans == null ? "—" : Math.round(x.scans).toLocaleString(), "—", "—", "—"])
      );
      slide.addTable(rows, {
        x: 0.62, y: 1.55, w: 12.08, h: 4.95,
        border: { type: "solid", pt: 0.6, color: L },
        fill: W, color: K, fontFace: F, fontSize: 16, margin: 0.06,
        rowH: 0.38, colW: [3.0, 1.1, 2.15, 1.85, 1.95, 1.95],
        bold: false, autoFit: false, breakLine: false,
      });
      footer(slide, 6);
    }

    return pptx;
  }

  window.exportEditablePPTX = async function () {
    const button = document.getElementById("pptx-btn");
    if (button) {
      button.disabled = true;
      button.dataset.old = button.textContent;
      button.textContent = "PPTX 生成中…";
    }
    try {
      const pptx = buildEditablePPTXV2();
      await pptx.writeFile({
        fileName: "Connected_Pack_流量汇报_" + curP().date + "_可编辑.pptx",
        compression: true,
      });
      toast("已下载 6 页可编辑 PPTX");
    } catch (error) {
      console.error(error);
      alert("PPTX 生成失败：" + error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.old || "⇩ 下载可编辑PPTX";
      }
    }
  };
})();
