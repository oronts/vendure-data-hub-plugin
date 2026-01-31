import {
    isEmpty as sharedIsEmpty,
    isNotEmpty as sharedIsNotEmpty,
    isNumeric,
    isInteger as sharedIsInteger,
    isBoolean as sharedIsBoolean,
    isValidEmail,
    isValidUrl,
    isValidDate,
} from '../../shared/utils/validation';

export const isEmpty = sharedIsEmpty;
export const isNotEmpty = sharedIsNotEmpty;
export const isNumber = isNumeric;
export const isInteger = sharedIsInteger;
export const isBoolean = sharedIsBoolean;
export const isEmail = isValidEmail;
export const isURL = isValidUrl;
export const isDate = isValidDate;
