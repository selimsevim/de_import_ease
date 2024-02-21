
// Variable Declarations
let counter = 1;
let initialFormState = null; 
let lastSavedFormState = {
    switchState: false,
    periodLength: '',
    periodUnit: '',
    retentionDate: '',
    dataRetentionStrategy: '',
    retentionPeriod: '',
    resetOnImport: false,
    name: '',
    customerKey: ''
};
let lastImportedData = null;
let messageTimeoutId;


function serializeForm(form) {
    let obj = {};
    new FormData(form).forEach((value, key) => {
        if (obj[key] !== undefined) {
            if (!Array.isArray(obj[key])) {
                obj[key] = [obj[key]];
            }
            obj[key].push(value);
        } else {
            obj[key] = value;
        }
    });
    return obj;
}

function displayError(title, message) {
    clearTimeout(messageTimeoutId);
    const errorMessageDiv = document.querySelector('.error-message');
    const errorTitle = errorMessageDiv.querySelector('h4');
    const errorParagraph = errorMessageDiv.querySelector('p');
    const successMessageDiv = document.querySelector('.success-message');
    const dragDropContent = document.querySelector('.drag-drop-content');

    successMessageDiv.style.display = 'none'; // Hide success message
    errorTitle.textContent = title;
    errorParagraph.textContent = message;
    errorMessageDiv.style.display = 'block';
    dragDropContent.style.display = "none";

    messageTimeoutId = setTimeout(() => {
        errorMessageDiv.style.display = 'none';
        dragDropContent.style.display = "block";
    }, 5000);
}

function displaySuccess(title, message) {
    clearTimeout(messageTimeoutId);
    const successMessageDiv = document.querySelector('.success-message');
    const successTitle = document.querySelector('#success-title');
    const successParagraph = document.querySelector('#success-message');
    const errorMessageDiv = document.querySelector('.error-message');
    const dragDropContent = document.querySelector('.drag-drop-content');

    errorMessageDiv.style.display = 'none'; // Hide error message
    successTitle.textContent = title;
    successParagraph.textContent = message;
    successMessageDiv.style.display = 'block';
    dragDropContent.style.display = "none";

    messageTimeoutId = setTimeout(() => {
        successMessageDiv.style.display = 'none';
        dragDropContent.style.display = "block";
    }, 5000);
}


function removeFieldRow(button) {
    const row = button.closest('tr');
    const tableBody = row.parentNode;  // Get the parent node (table body) before removing the row
    row.remove(); 
}

function handleDropdownChange(event) {
    const dropdown = event.target;
    const row = dropdown.closest('tr');

    const decimalInputsContainer = row.querySelector('.decimal-inputs-container');
    const fieldLengthInput = row.querySelector('input.field-length-input');

    if (dropdown.value === 'Decimal') {
        fieldLengthInput.hidden = true;
        decimalInputsContainer.hidden = false;
    } else {
        decimalInputsContainer.hidden = true;
        fieldLengthInput.hidden = false;
    }
}


function addFieldRow(event, button) {
    event.preventDefault();
    const tableBody = button.closest('tbody');
    // The row containing the clicked button
    const currentRow = button.closest('tr');
    // Create a new row element
    const newRow = document.createElement('tr');
    // Populate the row's cells
    newRow.innerHTML = generateFieldDate('', 'Text', '50');

    // If there's a next row, insert before it; otherwise, just append the new row
    if (currentRow.nextElementSibling) {
        tableBody.insertBefore(newRow, currentRow.nextElementSibling);
    } else {
        tableBody.appendChild(newRow);
    }
}

function isValidFileExtension(filename) {
    const validExtensions = ['.txt', '.csv'];
    const fileExtension = filename.split('.').pop();
    const isValid = validExtensions.includes('.' + fileExtension.toLowerCase());

    if (!isValid) {
        displayError("File type not supported!", "Only .csv and .txt extensions are allowed!");
        return false;
    }

    return isValid;
}

function handleDragOver(evt) {
    evt.preventDefault();
}


function handleDrop(evt) {
    evt.preventDefault();

    const fileInput = document.querySelector('.file-input');
    const dragDropContent = document.querySelector('.drag-drop-content');
    const loadingMessage = document.querySelector('.loading-message');
    const successMessageDiv = document.querySelector('.success-message');
    successMessageDiv.style.display = "none"; 

    if (evt.dataTransfer.items) {
        if (evt.dataTransfer.items[0].kind === 'file') {
            const file = evt.dataTransfer.items[0].getAsFile();
            fileInput.files = evt.dataTransfer.files;
        }
    } else {
        fileInput.files = evt.dataTransfer.files;
    }

    // Check the file size
    const isFileSizeValid = checkFileSize(fileInput);

    // Check file extension
    const isFileExtensionValid = isValidFileExtension(fileInput.files[0].name);


    if (isFileSizeValid && isFileExtensionValid) {
        sendFileToServer(evt.target.closest('form'));

        loadingMessage.style.display = "block";
        dragDropContent.style.display = "none";

    } else {
        // If client-side validation fails, show error using AJAX
        loadingMessage.style.display = "none";
    }
}

function sendFileToServer(form) {
    const formData = new FormData(form);
    const csrfToken = document.querySelector('#uploadForm input[name="csrfmiddlewaretoken"]').value;
    const loadingMessage = document.querySelector('.loading-message');
    const dragDropContent = document.querySelector('.drag-drop-content');
    const data_retention = document.querySelector('#data_retention');
    const data_extension_properties = document.querySelector('#data_extension_properties');
    const save_form = document.querySelector('#save_form');

    fetch(form.action, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken,
        }
    })
    .then(response => response.json())
    .then(data => {

        loadingMessage.style.display = "none";
        lastImportedData = data;

        if (data.status === 'success') {
            data_retention.style.display = "block";
            data_extension_properties.style.display = "block";
            save_form.style.display = "block";
            dragDropContent.style.display = "none";
            populateData(data.field_types,data.field_lengths, data.anomalies_report);
            displaySuccess("File successfully imported", "Drag and drop a new file to replace it");
        } else if (data.status === 'error') {
            displayError(data.message);  // Define this function to handle errors.
        }
    })
    .catch(error => {
        loadingMessage.style.display = "none";
        console.error('Error:', error);
        // Handle unexpected errors (network issues, server errors, etc.)
    });
}

function getFieldLengthForType(type) {
    const lengths = {
        'Locale': '5',
        'Phone': '50',
        'Email': '254'
    };
    return lengths[type] || ''; // returns an empty string if the type is not found in the lengths object
}

function populateData(field_types, field_lengths, anomalies_report,field_required, field_primary_key) {
    // Populating Field Data
    document.getElementById('field_data_div').style.display = 'block';
    const fieldsTableBody = document.querySelector('#field_data_div .table-striped tbody');
    fieldsTableBody.innerHTML = '';  // clear previous rows
    let fieldsTableHTML = "";
    let fieldRequired = "";
    let fieldPrimaryKey = "";

    for (let fieldName in field_types) {
        let fieldType = field_types[fieldName];
        if (field_required) {
            fieldRequired = field_required[fieldName];
        }
        if (field_primary_key) {
            fieldPrimaryKey = field_primary_key[fieldName];
        }
        let fieldLength = field_lengths.hasOwnProperty(fieldName) ? field_lengths[fieldName] : '';  // Get length or default to an empty string
        fieldLength = fieldLength || getFieldLengthForType(fieldType);
        fieldsTableHTML += generateFieldDate(fieldName, fieldType, fieldLength,fieldRequired, fieldPrimaryKey);        
    }
    fieldsTableBody.innerHTML = fieldsTableHTML;

    // Populating Anomalies Report
        document.getElementById('notes_div').style.display = 'block';
        document.getElementById('notes_div').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
        const notesTableBody = document.querySelector('#notes_div .table-bordered tbody');
        let notesTableHTML = "";
        
        for (let key in anomalies_report) {
            for (let anomaly of anomalies_report[key]) {
                notesTableHTML += generateNoteRow(anomaly);
            }
        }
        
        notesTableBody.innerHTML = notesTableHTML;
    }

function generateFieldDate(fieldName, fieldType, fieldLength,field_required, field_primary_key) {
    const isDecimal = fieldType === "Decimal";
    const disabled = (fieldType !== "Text" && !isDecimal) ? "disabled" : "";
    const hidden = isDecimal ? "hidden" : "";
    let requiredChecked = "";
    let primaryKeyChecked = "";

    if (field_required) {
        requiredChecked = "checked";
    }
    if (field_primary_key) {
        primaryKeyChecked = "checked";
    }

    let integerPart = 18; // Default value
    let decimalPart = 0; // Default value
    if (isDecimal) {
        if (typeof fieldLength === 'string') {
            // If it's a string, split it
            [integerPart, decimalPart] = fieldLength.split(',').map(num => parseInt(num, 10));
        } else if (Array.isArray(fieldLength)) {
            // If it's an array (tuple in Python, represented as an array in JavaScript), destructure it
            [integerPart, decimalPart] = fieldLength;
        } else {
            // Default values if fieldLength is neither a string nor an array
            integerPart = 18;
            decimalPart = 0;
        }
    }

    let rowHTML = `
        <tr>
            <td style="text-align:center;vertical-align: middle;">
                <button class="btn btn-success btn-sm" type="button" onclick="addFieldRow(event, this)"><i class="bi bi-plus"></i></button>
            </td>
            <td>
                <input type="text" class="form-control" id="field_name_${counter}" name="field_name_${counter}" value="${fieldName}" required>
            </td>
            <td>
                <select id="field_type_${counter}" name="field_type_${counter}" class="form-control" onchange="updateFieldLengthInput(this);">
                    <option value="Text" ${fieldType == "Text" ? "selected" : ""}>Text</option>
                    <option value="Number" ${fieldType == "Number" ? "selected" : ""}>Number</option>
                    <option value="Phone" ${fieldType == "Phone" ? "selected" : ""}>Phone</option>
                    <option value="Email" ${fieldType == "Email" ? "selected" : ""}>Email</option>
                    <option value="Locale" ${fieldType == "Locale" ? "selected" : ""}>Locale</option>
                    <option value="Boolean" ${fieldType == "Boolean" ? "selected" : ""}>Boolean</option>
                    <option value="Decimal" ${fieldType == "Decimal" ? "selected" : ""}>Decimal</option>
                    <option value="Date" ${fieldType == "Date" ? "selected" : ""}>Date</option>
                </select>
            </td>
    <td>
            <div style="display: flex; justify-content: space-between;">
                <input type="text" class="form-control field-length-input" id="field_lengths_${counter}" name="field_lengths_${counter}" value="${fieldLength}" ${disabled} onkeydown="onlyAllowNumericInput(event);" ${hidden}>
                <div class="decimal-inputs-container" ${!isDecimal ? "hidden" : ""}>
                    <input type="number" class="form-control decimal-input" id="field_lengths_${counter}_integer" name="field_lengths_${counter}_integer" value="${integerPart}" placeholder="Integers" ${!isDecimal ? "hidden" : ""}>
                    <input type="number" class="form-control decimal-input" id="field_lengths_${counter}_decimal" name="field_lengths_${counter}_decimal" value="${decimalPart}" placeholder="Decimals" ${!isDecimal ? "hidden" : ""}>
                </div>
            </div>
    </td>
            <td style="text-align:center; vertical-align: middle;">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" style="height: 28px;" id="field_required_${counter}" name="field_required_${counter}" class="form-control" ${requiredChecked}>
                </div>
            </td>
            <td style="text-align:center; height: 28px; vertical-align: middle;">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" style="height: 28px;" class="form-control" id="field_primary_${counter}" name="field_primary_${counter}" value="true" onchange="updatePrimaryKey(this);" ${primaryKeyChecked}>
                </div>
            </td>
            <td style="text-align:center;vertical-align: middle;">
                <button class="btn btn-danger btn-sm" type="button" onclick="removeFieldRow(this)"><i class="bi bi-trash"></i></button>
            </td>
        </tr>
    `;

    counter++; // Increment the counter for next row
    return rowHTML;
}

function generateNoteRow(anomaly) {
    let examplesHTML = '';
    
    if (anomaly.Examples) {
        examplesHTML = anomaly.Examples;
    } else {
        for (let example of anomaly.examples) {
            examplesHTML += `${example}<br>`;
        }
    }
    
    return `
        <tr>
            <td>${anomaly.Issue}</td>
        </tr>
    `;
}

function updateFieldLengthInput(fieldTypeDropdown) {
    const row = fieldTypeDropdown.closest('tr');
    const associatedFieldLengthInput = row.querySelector('input.field-length-input');
    const decimalInputsContainer = row.querySelector('.decimal-inputs-container');
    const decimalInputs = row.querySelectorAll('input.decimal-input');
    const integerInput = row.querySelector('input.decimal-input[id$="_integer"]');
    
    // Check if the inputs exist
    if (!associatedFieldLengthInput || !decimalInputsContainer) {
        console.error("Inputs not found!");
        return;
    }

    if (fieldTypeDropdown.value === 'Text') {
        associatedFieldLengthInput.removeAttribute('disabled');
        associatedFieldLengthInput.setAttribute('required', 'required');
        associatedFieldLengthInput.value = '50';
        associatedFieldLengthInput.hidden = false;
        decimalInputsContainer.hidden = true;
    } else if (fieldTypeDropdown.value === 'Decimal') {
        associatedFieldLengthInput.hidden = true;
        decimalInputsContainer.hidden = false;
        decimalInputs.forEach(input => {
            input.hidden = false;
            if (input !== integerInput) {
                input.removeAttribute('required'); // ensure only the integer input is required
            }
        });
        integerInput.setAttribute('required', 'required');
    } else {
        associatedFieldLengthInput.setAttribute('disabled', 'disabled');
        associatedFieldLengthInput.removeAttribute('required');
        associatedFieldLengthInput.hidden = false;
        decimalInputsContainer.hidden = true;

        // Setting special values for locale, phone, and email fields
        if (['Locale', 'Phone', 'Email', 'Date'].includes(fieldTypeDropdown.value)) {
            const lengths = {
                'Locale': '5',
                'Phone': '50',
                'Email': '254',
                'Date': ''
            };
            associatedFieldLengthInput.value = lengths[fieldTypeDropdown.value];
        }
    }
}

function updatePrimaryKey(primaryCheckbox) {
    const allPrimaryCheckboxes = document.querySelectorAll('input[name^="field_primary_"]');
    const associatedRequiredCheckbox = primaryCheckbox.closest('tr').querySelector('input[name^="field_required_"]');

    if (primaryCheckbox.checked) {
        allPrimaryCheckboxes.forEach(checkbox => {
            if (checkbox !== primaryCheckbox) {
                checkbox.checked = false;
                checkbox.setAttribute('disabled', 'disabled');
            }
        });
        
        // Set the associated Required field to checked
        associatedRequiredCheckbox.checked = true;
    } else {
        allPrimaryCheckboxes.forEach(checkbox => {
            checkbox.removeAttribute('disabled');
        });
    }
}

        // Function to restrict non-numeric input
function onlyAllowNumericInput(event) {
    // Allow: backspace, delete, tab, escape, and enter
    if ([46, 8, 9, 27, 13, 110].indexOf(event.keyCode) !== -1 ||
        // Allow: Ctrl+A, Command+A
        (event.keyCode === 65 && (event.ctrlKey === true || event.metaKey === true)) ||
        // Allow: Ctrl+C, Command+C
        (event.keyCode === 67 && (event.ctrlKey === true || event.metaKey === true)) ||
        // Allow: Ctrl+V, Command+V
        (event.keyCode === 86 && (event.ctrlKey === true || event.metaKey === true)) ||
        // Allow: Ctrl+X, Command+X
        (event.keyCode === 88 && (event.ctrlKey === true || event.metaKey === true)) ||
        // Allow: home, end, left, right
        (event.keyCode >= 35 && event.keyCode <= 39)) {
        // Let it happen, don't do anything
        return;
    }

    // Ensure that it is a number and stop the keypress if not
    if ((event.shiftKey || (event.keyCode < 48 || event.keyCode > 57)) && 
        (event.keyCode < 96 || event.keyCode > 105)) {
        event.preventDefault();
    }
}

function captureCurrentFormState() {
    const fieldNames = [...document.querySelectorAll('[name^="field_name_"]:not([type="hidden"])')].map(input => input.value);
    const fieldTypes = [...document.querySelectorAll('[name^="field_type_"]:not([type="hidden"])')].map(select => select.value);

    const fieldLengths = {};
    document.querySelectorAll('.decimal-inputs-container:not([hidden])').forEach(container => {
        // Get the field name by parsing the id of a sibling input (e.g., field_name_1)
        const fieldNameInput = container.closest('tr').querySelector('[name^="field_name_"]');
        const fieldName = fieldNameInput.value;

        // Get the indexes from the input names
        const integerInput = container.querySelector('[id$="_integer"]');
        const decimalInput = container.querySelector('[id$="_decimal"]');
        
        // Use the field name to create the structure
        fieldLengths[fieldName] = [
            integerInput && integerInput.value ? parseInt(integerInput.value, 10) : 0,
            decimalInput && decimalInput.value ? parseInt(decimalInput.value, 10) : 0
        ];
    });

    document.querySelectorAll('[name^="field_lengths_"]:not([hidden]):not([id$="_integer"]):not([id$="_decimal"])').forEach(input => {
        // Get the field name by parsing the id of a sibling input
        const fieldNameInput = input.closest('tr').querySelector('[name^="field_name_"]');
        const fieldName = fieldNameInput.value;
        
        fieldLengths[fieldName] = input.value;
    });

    const fieldRequired = [...document.querySelectorAll('[name^="field_required_"]:not([type="hidden"])')].map(checkbox => checkbox.checked);
    const fieldPrimaryKey = [...document.querySelectorAll('[name^="field_primary_"]:not([type="hidden"])')].map(checkbox => checkbox.checked);



    const currentFormState = {
        field_types: {},
        field_lengths: {},
        field_required: {},
        field_primary_key: {},
    };

    fieldNames.forEach((fieldName, index) => {
        currentFormState.field_types[fieldName] = fieldTypes[index];
        currentFormState.field_lengths[fieldName] = fieldLengths[fieldName];
        currentFormState.field_required[fieldName] = fieldRequired[index];
        currentFormState.field_primary_key[fieldName] = fieldPrimaryKey[index];
    });

    // Store the anomalies_report from the lastImportedData (you can modify this if needed)
    currentFormState.anomalies_report = lastImportedData ? lastImportedData.anomalies_report : {};

    return currentFormState;
}

function showTooltip(element, message) {
    // Set the title attribute to the message you want to show
    element.setAttribute('title', message);
    
    // Add data attributes required for the Bootstrap tooltip
    element.setAttribute('data-toggle', 'tooltip');
    element.setAttribute('data-placement', 'top');
    
    // Initialize the tooltip for this specific element
    $(element).tooltip('show');
}

function hideTooltip(element) {
    // Destroy the tooltip
    $(element).tooltip('hide');
    
    // Remove the title and data attributes
    element.removeAttribute('title');
    element.removeAttribute('data-toggle');
    element.removeAttribute('data-placement');
}

function isDuplicateFieldName(fieldName, currentInput) {
    const allFieldNames = document.querySelectorAll('input[name^="field_name_"]');
    let duplicateCount = 0;

    allFieldNames.forEach(input => {
        if (input !== currentInput && input.value === fieldName) {
            duplicateCount++;
        }
    });

    return duplicateCount > 0;
}

document.addEventListener("input", function(event) {
    if (event.target.matches('input[name^="field_name_"]')) {
        if (isDuplicateFieldName(event.target.value, event.target)) {
            // Highlight the input to indicate error
            event.target.classList.add('is-invalid');
            
            // Show tooltip
            showTooltip(event.target, "Duplicate field name!");
        } else {
            // Remove any previous error indication
            event.target.classList.remove('is-invalid');
            
            // Hide tooltip
            hideTooltip(event.target);
        }
    }
});

function checkFileSize(inputElement) {
    const maxFileSizeMB = 2;
    if (inputElement.files && inputElement.files[0]) {
        const fileSize = inputElement.files[0].size / 1024 / 1024; // size in MB
        if (fileSize > maxFileSizeMB) {
            inputElement.classList.add('is-invalid');
            displayError("File size is too large!", `Max size is ${maxFileSizeMB} MB.`);
            return false;
        } else {
            inputElement.classList.remove('is-invalid');
        }
    }
    return true;
}

function initializeSwitchBehavior() {
    const retentionSwitch = document.getElementById("retentionSwitch");
    const retentionPolicyDiv = document.getElementById("retentionPolicySettings");
    const periodLengthInput = document.querySelector('input[name="periodLength"]');

    if (retentionSwitch) {
        // Directly apply the switch state
        reflectSwitchState();
        
        // Handle switch change
        retentionSwitch.addEventListener("change", reflectSwitchState);
    }
}

function reflectSwitchState() {
    const retentionSwitch = document.getElementById("retentionSwitch");
    const retentionPolicyDiv = document.getElementById("retentionPolicySettings");
    const periodLengthInput = document.querySelector('input[name="periodLength"]');

    if (retentionSwitch.checked) {
        retentionPolicyDiv.style.display = "block";
        periodLengthInput.required = true;
    } else {
        retentionPolicyDiv.style.display = "none";
        periodLengthInput.required = false;
    }
}

document.addEventListener("DOMContentLoaded", function() {

    const resetOnImportCheckbox = document.getElementById("resetOnImport");
    resetOnImportCheckbox.setAttribute("disabled", true);

    const retentionSwitch = document.getElementById("retentionSwitch");

    // Handle switch change
    if (retentionSwitch) {
        retentionSwitch.addEventListener("change", reflectSwitchState);
    }

    // Check the initial state of the switch and display content accordingly
    reflectSwitchState();

    const fieldTypeDropdowns = document.querySelectorAll('select[name^="field_type_"]');
    fieldTypeDropdowns.forEach(dropdown => {
    updateFieldLengthInput(dropdown);  // update inputs based on the dropdown value
        if (dropdown.value === 'Text') {
            const row = dropdown.closest('tr');
            const fieldLengthInput = row.querySelector('input.field-length-input');
            fieldLengthInput.value = '50';
        }
    });

function initializeFormEvents() {
    const saveForm = document.getElementById("save_form");
    const saveButton = document.querySelector('.save_button');
    const goBackbutton = document.querySelector('#go_back');


    if (!initialFormState) {
        initialFormState = saveForm.innerHTML;  // Store the initial form state
    }

    if (!saveForm._isEventListenerAdded) {
        saveButton.addEventListener("click", handleSaveButtonClick(saveForm));
        goBackbutton.addEventListener("click", function(event) {
            event.preventDefault(); // Prevent any default behavior.
            handleGoBackClick(saveForm);
        });
        saveForm._isEventListenerAdded = true;  // Mark the form as having the event listener
    }
}

function handleSaveButtonClick(saveForm) {
    return function(event) {
        event.preventDefault();
        let formData = new FormData(saveForm);
        const retentionSwitch = document.getElementById("retentionSwitch");

        lastSavedFormState.switchState = document.getElementById("retentionSwitch").checked;
        lastSavedFormState.periodLength = document.querySelector('input[name="periodLength"]').value;
        lastSavedFormState.periodUnit = document.querySelector('select[name="periodUnit"]').value;
        lastSavedFormState.dataRetentionStrategy = document.querySelector('input[name="dataRetentionStrategy"]:checked').value;
        lastSavedFormState.retentionPeriod = document.querySelector('input[name="retentionPeriod"]:checked').value;
        lastSavedFormState.resetOnImport = document.getElementById('resetOnImport').checked;
        lastSavedFormState.retentionDate = document.querySelector('input[name="retentionDate"]').value;
        lastSavedFormState.name = document.getElementById("name").value;
        lastSavedFormState.customerKey = document.getElementById("customerKey").value;

    if (!retentionSwitch.checked) {
        formData.delete('periodLength');
        formData.delete('periodUnit');
        formData.delete('dataRetentionStrategy');
        formData.delete('retentionPeriod');
        formData.delete('retentionDate');
        formData.delete('resetOnImport');
    }

    let isValid = true;  // Default validation state
    let firstInvalidElement = null;
    lastImportedData = captureCurrentFormState();

    // Get all input elements inside the form
    const inputElements = saveForm.querySelectorAll('input,select,textarea');

    // Iterate over each input element
    inputElements.forEach(input => {
        if (!input.checkValidity()) {
            isValid = false;
            if (!firstInvalidElement) {
                firstInvalidElement = input;  // Set the first invalid element
            }

            if (input.validity.valueMissing) {
                // Field is required and is missing a value
                showTooltip(input, 'This field is required.');
            } else {
                // Other validation errors can be handled here, if needed
                showTooltip(input, 'Invalid input.');
            }
        } else {
            hideTooltip(input);  // Hide the tooltip if it was previously shown
        }
    });

    // If there's an invalid element, scroll to it smoothly
    if (firstInvalidElement) {
        firstInvalidElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'  // 'center' will place the invalid field in the center of the viewport
        });
    }

    // If the form is not valid, simply return
    if (!isValid) {
        return;
    }

    const data_retention = document.querySelector('#data_retention');
    const data_extension_properties = document.querySelector('#data_extension_properties');
    const save_form = document.querySelector('#save_form');
    const field_data = document.querySelector('#field_data_div');
    const notes = document.querySelector('#notes_div');
    const goBackbutton = document.querySelector('#go_back');

    fetch("/save_field_data/", {
        method: "POST",
        body: formData,
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    })
    .then(response => response.json())
    .then(data => {
        data_retention.style.display = "none";
        data_extension_properties.style.display = "none";
        save_form.style.display = "none";
        field_data.style.display = "none";
        notes.style.display = "none";
        goBackbutton.style.display = "block";

    if (data.status === "error") {
        let errorMessage = data.message;

        if (errorMessage.includes("Updating an existing Data Extension definition is not allowed when doing an add-only operation.")) {
            errorMessage = "The name or customer key used for the creation of this DE is already in use.";
        }

        displayError("Please review the following error:", errorMessage); 

        } else {
            displaySuccess("The data extension has been created in your Data Extensions folder.", "Drag and drop a new file there to start over");
        }
    })
    .catch(error => {
        console.error("Error:", error);
    });


    };
}

function handleGoBackClick(saveForm) {
    if (initialFormState) {
        saveForm.innerHTML = initialFormState;
    } else {
        saveForm.reset();  // Consider using the form's reset method as an alternative
    }

    if (lastImportedData) {
        populateData(
            lastImportedData.field_types, 
            lastImportedData.field_lengths, 
            lastImportedData.anomalies_report,
            lastImportedData.field_required,
            lastImportedData.field_primary_key
        );
    }

    const specificDateRadio = document.getElementById("specificDate");
    const retentionDateInput = document.querySelector('input[name="retentionDate"]');

    // Check and update the state based on lastSavedFormState
    if (lastSavedFormState.retentionPeriod === 'specificDate') {
        specificDateRadio.checked = true;
        specificDateRadio.disabled = false; // Enable the radio button
        retentionDateInput.disabled = false; // Enable the date input field
        retentionDateInput.value = lastSavedFormState.retentionDate;
    } else {
        specificDateRadio.checked = false;

    }

    initializeSwitchBehavior();

    document.getElementById("retentionSwitch").checked = lastSavedFormState.switchState;
    document.querySelector('input[name="periodLength"]').value = lastSavedFormState.periodLength;
    document.querySelector('select[name="periodUnit"]').value = lastSavedFormState.periodUnit;
    document.querySelector(`input[name="dataRetentionStrategy"][value="${lastSavedFormState.dataRetentionStrategy}"]`).checked = true;
    document.querySelector(`input[name="retentionPeriod"][value="${lastSavedFormState.retentionPeriod}"]`).checked = true;
    document.getElementById('resetOnImport').checked = lastSavedFormState.resetOnImport;
    document.getElementById("name").value = lastSavedFormState.name;
    document.getElementById("customerKey").value = lastSavedFormState.customerKey;

    reflectSwitchState();
    attachEventListenersForForm();

    const elementsToHide = [
        '#go_back'
    ];
    
    const elementsToShow = [
        '#save_form',
        '#data_retention',
        '#data_extension_properties',
        '#field_data_div',
        '#notes_div'
    ];
    
    elementsToHide.forEach(selector => {
        document.querySelector(selector).style.display = 'none';
    });
    
    elementsToShow.forEach(selector => {
        document.querySelector(selector).style.display = 'block';
    });

    saveForm._isEventListenerAdded = false; 

    initializeFormEvents();
}

initializeFormEvents();

function attachEventListener(id, callback) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener("change", callback);
    }
}

function attachEventListenersForForm() {

    // Use the attachEventListener function for each of your elements:
    attachEventListener("specificDate", function() {
        if(this.checked) {
            document.querySelector('input[name="retentionDate"]').setAttribute("required", true);
            document.querySelector('input[name="retentionPeriod"]').removeAttribute("required");
            document.querySelector('input[name="periodLength"]').removeAttribute("required");
        } 
    });

    attachEventListener("afterPeriod", function() {
        document.querySelector('input[name="retentionDate"]').removeAttribute("required");
        document.querySelector('input[name="periodLength"]"]').setAttribute("required", true);
    });

    attachEventListener("allRecordsDataExtensions", function() {
        document.querySelector('input[name="retentionDate"]').removeAttribute("required");
    });

    attachEventListener("allRecords", function() {
        document.querySelector('input[name="retentionDate"]').removeAttribute("required");
    });

    attachEventListener("individualRecords", function() {
        const resetOnImportCheckbox = document.getElementById("resetOnImport");
        const specificDateRadio = document.getElementById("specificDate");
        const retentionDateInput = document.querySelector('input[name="retentionDate"]');
        resetOnImportCheckbox.setAttribute("disabled", true);
        
        if(this.checked) {
            resetOnImportCheckbox.setAttribute("disabled", true);
            specificDateRadio.setAttribute("disabled", true);
            retentionDateInput.setAttribute("disabled", true);
        } else {
            resetOnImportCheckbox.removeAttribute("disabled");
            specificDateRadio.removeAttribute("disabled");
            retentionDateInput.removeAttribute("disabled");
        }
    });

    function enableAllRecordsAndExtensionsFields() {
        const resetOnImportCheckbox = document.getElementById("resetOnImport");
        const specificDateRadio = document.getElementById("specificDate");
        const retentionDateInput = document.querySelector('input[name="retentionDate"]');

        resetOnImportCheckbox.removeAttribute("disabled");
        specificDateRadio.removeAttribute("disabled");
        retentionDateInput.removeAttribute("disabled");
    }

    attachEventListener("allRecordsDataExtensions", enableAllRecordsAndExtensionsFields);
    attachEventListener("allRecords", enableAllRecordsAndExtensionsFields);

}

attachEventListenersForForm();

const tableElem = document.querySelector('.table');

if (tableElem) {
    tableElem.addEventListener('change', function(event) {
        if (event.target.name && event.target.name.startsWith('field_type_')) {
            updateFieldLengthInput(event.target);
        }
    });
}

});

$(document).ready(function() {
    $('[data-toggle="tooltip"]').tooltip();
});

window.addEventListener("pageshow", function() {
    // Check the initial state of the switch and display content accordingly
    reflectSwitchState();
});