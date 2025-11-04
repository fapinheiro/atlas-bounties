const validateMonetaryAmount = (value, options = {}) => {
    const { minValue = 0, maxValue = Number.MAX_VALUE, maxDecimals = 2 } = options;

    // Remove any currency symbols and spaces
    const cleanValue = String(value).replace(/[R$\s]/g, '').replace(',', '.');

    // Check if it's a valid number
    const numValue = parseFloat(cleanValue);
    if (isNaN(numValue)) {
        return { valid: false, error: 'Valor inválido. Use apenas números.' };
    }

    // Check decimal places
    const decimalPart = cleanValue.split('.')[1];
    if (decimalPart && decimalPart.length > maxDecimals) {
        return { valid: false, error: `Máximo de ${maxDecimals} casas decimais permitidas.` };
    }

    // Check range
    if (numValue < minValue) {
        return { valid: false, error: `Valor mínimo é R$ ${minValue.toFixed(2)}` };
    }

    if (numValue > maxValue) {
        return { valid: false, error: `Valor máximo é R$ ${maxValue.toFixed(2)}` };
    }

    return { valid: true, value: numValue };
};

module.exports = { validateMonetaryAmount };