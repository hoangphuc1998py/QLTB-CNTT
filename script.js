let devices = JSON.parse(localStorage.getItem("devices")) || [];
let editIndex = -1;

// LOGIN (demo)
function login() {
  let user = document.getElementById("user").value;
  let pass = document.getElementById("pass").value;

  if (user === "admin" && pass === "123") {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("app").style.display = "block";
  } else {
    alert("Sai tài khoản!");
  }
}

// Lưu
function save() {
  localStorage.setItem("devices", JSON.stringify(devices));
}

// Render
function render() {
  let keyword = document.getElementById("search").value.toLowerCase();
  let html = "";

  devices.forEach((d, i) => {
    if (
      d.name.toLowerCase().includes(keyword) ||
      d.type.toLowerCase().includes(keyword)
    ) {
      html += `
      <tr>
        <td><img src="${d.image || ''}"></td>
        <td>${d.name}</td>
        <td>${d.type}</td>
        <td>${d.status}</td>
        <td>
          <button onclick="editDevice(${i})">Sửa</button>
          <button onclick="deleteDevice(${i})">Xóa</button>
        </td>
      </tr>`;
    }
  });

  document.getElementById("list").innerHTML = html;
}

// Upload ảnh
function getImageBase64(file, callback) {
  let reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

// Thêm
function addDevice() {
  let file = document.getElementById("image").files[0];

  if (file) {
    getImageBase64(file, (img) => {
      saveDevice(img);
    });
  } else {
    saveDevice("");
  }
}

function saveDevice(img) {
  let name = document.getElementById("name").value;
  let type = document.getElementById("type").value;
  let status = document.getElementById("status").value;

  devices.push({ name, type, status, image: img });
  save();
  render();
}

// Xóa
function deleteDevice(i) {
  devices.splice(i, 1);
  save();
  render();
}

// Sửa
function editDevice(i) {
  let d = devices[i];

  name.value = d.name;
  type.value = d.type;
  status.value = d.status;

  editIndex = i;
  updateBtn.style.display = "block";
}

// Update
function updateDevice() {
  devices[editIndex] = {
    name: name.value,
    type: type.value,
    status: status.value,
    image: devices[editIndex].image
  };

  save();
  render();
  updateBtn.style.display = "none";
}

// Xuất CSV (Excel)
function exportCSV() {
  let csv = "Tên,Loại,Tình trạng\n";

  devices.forEach(d => {
    csv += `${d.name},${d.type},${d.status}\n`;
  });

  let blob = new Blob([csv], { type: "text/csv" });
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "devices.csv";
  a.click();
}

render();