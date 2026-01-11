import AsyncStorage from '@react-native-async-storage/async-storage';
    
export const salvarLinhas = async (linha: any[]) => {
    try{
        await AsyncStorage.setItem('@linhasSelecionadas', JSON.stringify(linha));
    } catch (error) {
        console.error('Erro ao salvar a linha:', error);
    }
};

export const carregarLinhasSalvas = async () => {
    try {
        const linhaString = await AsyncStorage.getItem('@linhasSelecionadas');
        return linhaString ? JSON.parse(linhaString) : [];
    } catch (error) {
        console.error('Erro ao carregar a linha:', error);
        return [];
    }
};

// export const limparLinhasSalvas = async () => {
//     try {
//         await AsyncStorage.removeItem('@linhasSelecionadas');
//     } catch (error) {
//         console.error('Erro ao limpar as linhas salvas:', error);
//     }
// };

// export const salvarFiltro = async (filtro: string) => {
//     try{
//         await AsyncStorage.setItem('@filtroBusca', filtro);
//     } catch (error) {
//         console.error('Erro ao salvar o filtro:', error);
//     }
// };

// export const carregarFiltro = async () => {
//     try {
//         const filtro = await AsyncStorage.getItem('@filtroBusca');
//         return filtro || '';
//     } catch (error) {
//         console.error('Erro ao carregar o filtro:', error);
//         return '';
//     }
// };