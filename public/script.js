let selection = { plot_id: null, pest_id: null, g_id: null, c_id: null, p_id: null };

window.onload = () => { loadPlots(); loadHistory(); };

// จัดการแปลง
async function loadPlots() {
    const res = await fetch('/api/plots');
    const data = await res.json();
    document.getElementById('plotSelect').innerHTML = '<option value="">-- เลือกแปลง --</option>' + 
        data.map(p => `<option value="${p.plot_id}">${p.plot_name}</option>`).join('');
}

async function addPlot() {
    const name = prompt("ระบุชื่อแปลงใหม่:");
    if (!name) return;
    await fetch('/api/add-plot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plot_name: name })
    });
    loadPlots();
}

async function renamePlot() {
    const plotId = document.getElementById('plotSelect').value;
    if (!plotId) return alert("กรุณาเลือกแปลงก่อนแก้ไขชื่อ");
    const newName = prompt("พิมพ์ชื่อใหม่ของแปลงนี้:");
    if (!newName) return;
    const res = await fetch('/api/rename-plot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plot_id: plotId, new_name: newName })
    });
    if ((await res.json()).success) { alert("แก้ไขชื่อสำเร็จ"); loadPlots(); }
}

async function deletePlot() {
    const plotId = document.getElementById('plotSelect').value;
    if (!plotId || !confirm("ยืนยันการลบ? (ประวัติจะถูกเปลี่ยนเป็น 'ยกเลิกการใช้งาน')")) return;
    const res = await fetch(`/api/delete-plot/${plotId}`, { method: 'DELETE' });
    if ((await res.json()).success) location.reload();
}

function selectPlot() {
    selection.plot_id = document.getElementById('plotSelect').value;
    if (selection.plot_id) document.getElementById('step1').classList.remove('hidden');
}

// ระบบค้นหาและบันทึก
async function searchPests() {
    const name = document.getElementById('searchPest').value;
    if (name.length < 2) return;
    const res = await fetch(`/api/pests?name=${name}`);
    const data = await res.json();
    document.getElementById('pestList').innerHTML = data.map(p => 
        `<div class="list-item" onclick="selectPest(${p.pest_id}, '${p.pest_name}')">${p.pest_name}</div>`).join('');
}

async function selectPest(id, name) {
    selection.pest_id = id;
    const lastRes = await fetch(`/api/last-moa/${selection.plot_id}`);
    const lastData = await lastRes.json();
    const res = await fetch(`/api/moa/${id}`);
    const data = await res.json();
    document.getElementById('moaList').innerHTML = data.map(g => {
        const isSame = (g.g_id === lastData.g_id);
        return `<div class="list-item" style="background:${isSame?'#fff5f5':'white'}" onclick="selectMoA('${g.g_id}')">
            <span class="moa-badge">กลุ่ม ${g.g_id}</span> ${g.g_name} ${isSame ? '<b style="color:red;">(⚠️ ใช้ซ้ำกลุ่มเดิม)</b>' : ''}
        </div>`;
    }).join('');
    document.getElementById('step2').classList.remove('hidden');
}

async function selectMoA(g_id) {
    selection.g_id = g_id;
    const res = await fetch(`/api/products/${selection.pest_id}/${g_id}`);
    const data = await res.json();
    document.getElementById('productList').innerHTML = data.map(p => 
        `<div class="list-item" onclick="selectProduct(${p.c_id}, ${p.p_id}, '${p.p_name}')">${p.p_name}</div>`).join('');
    document.getElementById('step3').classList.remove('hidden');
}

function selectProduct(c_id, p_id, p_name) {
    selection.c_id = c_id; selection.p_id = p_id;
    document.getElementById('summaryText').innerText = `ยืนยันบันทึก: ${p_name}`;
    document.getElementById('step5').classList.remove('hidden');
}

async function saveHistory() {
    await fetch('/api/save-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selection, notes: document.getElementById('note').value })
    });
    alert('บันทึกสำเร็จ!'); location.reload();
}

async function loadHistory() {
    const res = await fetch('/api/history');
    const data = await res.json();
    document.getElementById('historyTableBody').innerHTML = data.map(h => {
        const plotDisplay = h.plot_name === 'ยกเลิกการใช้งาน' ? `<span style="color:#999; font-style:italic;">${h.plot_name}</span>` : h.plot_name;
        return `<tr>
            <td>${h.usage_date ? new Date(h.usage_date).toLocaleDateString('th-TH') : '-'}</td>
            <td>${plotDisplay}</td>
            <td>${h.pest_name || '-'}</td>
            <td><span class="moa-badge">${h.g_id}</span></td>
            <td>${h.p_name || '-'}</td>
            <td>${h.notes || '-'}</td>
        </tr>`;
    }).join('');
}