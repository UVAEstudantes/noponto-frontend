import InputBusca from '@/src/components/inputBusca';
import Select from '@/src/components/select';
import SelectTransporte from '@/src/components/selectTransporte';
import { ArrowLeftRight, ArrowRightLeft, Bus, BusFront, ListFilter, LucideIcon, Train, TrainFrontTunnel, History, Timer, HistoryIcon, Hourglass, Banknote, CreditCardIcon, ShoppingBag, Hospital, Medal } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import MapView from 'react-native-maps';

const linhas = () => {

    const [modal, setModal] = useState<String | null>("Onibus");
    const [placeholder, setPlaceholder] = useState("Selecione um tipo de Transporte");
    const [icon, setIcon] = useState<LucideIcon>(ListFilter);


    // mudar placeholder e icon do input de busca
    useEffect(() => {
    if (modal === "Onibus") {
        setPlaceholder("Buscar Linhas Ônibus");
        setIcon(BusFront);
        console.log("mudou para onibus");
    } 
    else if (modal === "BRT") {
        setPlaceholder("Buscar Linhas BRT");
        setIcon(Bus);
        console.log("mudou para brt");
    }
    else if (modal === "Trem") {
        setPlaceholder("Buscar Ramal");
        setIcon(Train);
        console.log("mudou para trem");
    }
    else if (modal === "Metro") {
        setPlaceholder("Buscar Linhas Metrô");
        setIcon(TrainFrontTunnel);
        console.log("mudou para metro");
    }
    }, [modal]);

    const mockLinhas = [

    { id: 1, modal: "onibus", nome: "232", sentido: "Lins ↔ Castelo", intervalo: "20 minutos" },
    { id: 2, modal: "onibus", nome: "238", sentido: "Marechal Hermes ↔ Castelo", intervalo: "10 minutos" },
    { id: 3, modal: "onibus", nome: "415", sentido: "Leblon ↔ Usina", intervalo: "15 minutos" },
    { id: 4, modal: "onibus", nome: "457", sentido: "Copacabana ↔ Abolição", intervalo: "10 minutos" },
    { id: 5, modal: "onibus", nome: "474", sentido: "Jacaré ↔ Jardim de Alah", intervalo: "20 minutos" },
    { id: 6, modal: "onibus", nome: "838", sentido: "Campo Grande ↔ Carioca", intervalo: "15 minutos" },
    { id: 7, modal: "onibus", nome: "855", sentido: "Bangu ↔ Candelária", intervalo: "25 minutos" },

    { id: 8, modal: "brt", nome: "10", sentido: "Santa Cruz ↔ Jardim Oceânico", intervalo: "12 minutos" },
    { id: 9, modal: "brt", nome: "12", sentido: "Terminal Alvorada ↔ Aeroporto Galeão", intervalo: "10 minutos" },
    { id: 10, modal: "brt", nome: "35", sentido: "Recreio ↔ Deodoro", intervalo: "22 minutos" },
    { id: 11, modal: "brt", nome: "38", sentido: "Deodoro ↔ Candelária", intervalo: "09 minutos" },

    { id: 12, modal: "trem", nome: "Ramal Deodoro", sentido: "Central do Brasil ↔ Deodoro", intervalo: "20 minutos" },
    { id: 13, modal: "trem", nome: "Ramal Santa Cruz", sentido: "Central do Brasil ↔ Santa Cruz", intervalo: "18 minutos" },
    { id: 14, modal: "trem", nome: "Ramal Japeri", sentido: "Central do Brasil ↔ Japeri", intervalo: "16 minutos" },
    { id: 15, modal: "trem", nome: "Ramal Saracuruna", sentido: "Central do Brasil ↔ Saracuruna", intervalo: "15 minutos" },

    { id: 16, modal: "metro", nome: "Linha 1", sentido: "Uruguai ↔ General Osório", intervalo: "08 minutos" },
    { id: 17, modal: "metro", nome: "Linha 2", sentido: "Pavuna ↔ Botafogo", intervalo: "06 minutos" },
    { id: 18, modal: "metro", nome: "Linha 4", sentido: "Jardim Oceânico ↔ General Osório", intervalo: "10 minutos" },
    ];


    const [busca, setBusca] = useState("");
    const [data, setData] = useState(mockLinhas);
    const [linhaSelecionada, setLinhaSelecionada] = useState<any>(null);
    const [sentidoSelecionado, setSentidoSelecionado] = useState<string | null>(null);

    const buscarLinhas = (text: string) => {
        setBusca(text);

        const modalFormatado = modal ?.toLowerCase();

        const filtrar = mockLinhas.filter(linha => 
            linha.nome.toLowerCase().startsWith(text.toLowerCase()) && 
            linha.modal.toLowerCase() === modalFormatado
        );
        
        setData(filtrar);
    };

    const listaSelecionada = (linha: any) => { // esconde a lista e pega o nome se clicar em um item da lista
        setBusca(linha.nome);
        setData([]);
        setLinhaSelecionada(linha);
    }

    useEffect(() => { // limpa o input se trocar de modal
        setBusca("");
        setData([]);
        setLinhaSelecionada(null);
        setSentidoSelecionado(null)    
    }, [modal]);

    const sentido = () => {
        if (!linhaSelecionada)
            return [];

        return linhaSelecionada.sentido
        .split("↔")
        .map((s:string) => s.trim());
    };

    const buscaAtiva = busca !== "" && data.length > 0;

    return ( 

        <View className=" flex-1 bg-white"> 
        
            <MapView 
                style={{ position: 'absolute', top:0, left:0, right: 0, bottom: 600, zIndex:0 }}

                mapType='standard' // tipo de mapa
                showsUserLocation= {true}
                followsUserLocation= {true}
                showsMyLocationButton= {false}

                customMapStyle={[ // remover os locais como lojas e coisas do tipo
                    {
                    featureType: "poi",
                    stylers: [{visibility: "off"}]
                    }
                ]}

                initialRegion={{
                    latitude: -22.512384145462976,
                    longitude: -43.22661972224441,
                    latitudeDelta: 0.2,
                    longitudeDelta: 0.2,
                }}

            />

            {/*container de linhas*/}
            
            <FlatList
                scrollEnabled={!buscaAtiva}
                className='absolute rounded-3xl w-full h-[75%] bottom-0 mb-8 bg-customGray z-10'
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                data={[{key: 'content'}]}
                //renderItem={null}
                keyExtractor={(item) => item.key}
                contentContainerStyle={{ paddingBottom: 80 }}
                renderItem={() => (

                <>

                    <Text className="mt-7 text-2xl font-semibold self-center">Linhas e Hórarios</Text>
                    
                    <SelectTransporte modal={modal} setModal={setModal}/>

                    {/*input buscar linha*/}
                    <View className='bg-customGray mt-2 pt-5 '>

                        <InputBusca placeholder={placeholder} icon={icon} className='!w-[90%] self-center mb-5' 
                        value={busca} onChangeText={buscarLinhas}
                        />

                        {buscaAtiva && (
                            <View className="h-[150] bg-white rounded-xl mx-10 w-[90%] self-center shadow-sm border border-gray-200 overflow-hidden mb-4">
                                <ScrollView 
                                    nestedScrollEnabled={true} 
                                    keyboardShouldPersistTaps="handled"
                                    showsVerticalScrollIndicator={true}
                                >
                                    {data.map((item) => (
                                        <Pressable
                                            key={item.id}
                                            onPress={() => listaSelecionada(item)}
                                            className="p-4 border-b border-gray-100 active:bg-gray-200"
                                        >
                                            <Text className="text-lg font-semibold">{item.nome}</Text>
                                            <Text className="text-gray-500 text-sm">{item.sentido}</Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <Select placeholder="Selecione o Sentido" className='!w-[90%] self-center'
                        options={sentido()}
                        value={sentidoSelecionado}
                        onChange={setSentidoSelecionado}/>
                                        

                    </View>

{/* ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

                    
                    {/*container de resultado*/}
                    {!linhaSelecionada && !sentidoSelecionado && (
                    <View className='w-full mt-8 h-full'>
                    
                    <Text className='left-6 font-semibold mb-4 text-lg'>Linha {busca} - {sentidoSelecionado}</Text>
                    
                    {/* container de chegada */}
                    <View className='m-5 mt-0 bg-white rounded-2xl h-[145px] shadow-md'>

                        {/* header */}
                        <View className=' p-4 bg-customBlack rounded-t-2xl'>
                            <HistoryIcon color='#FFC107' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />
                        
                            <View>
                                <Text className='color-white font-semibold px-[40px]'>Chegada Estimada</Text>
                                <Text className='absolute right-0 color-customYellow px-[10px]'>Apróx. 5 minutos</Text>
                            </View>

                        </View>
                        
                        {/* proxima viagem */}
                        <View className=' p-4 rounded-t-2xl '>
                            <BusFront color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Próxima Viagem</Text>
                                <Text className='absolute right-0 color-customBlack font-semibold px-[10px]'>14:30</Text>
                            </View>

                        </View>

                        {/* intervalo */}
                        <View className=' p-4 rounded-t-2xl border-t border-gray-200'>
                            <Hourglass color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Intervalo</Text>
                                <Text className='absolute right-0 color-customBlack font-semibold px-[10px]'>linhaSelecionada.intervalo</Text>
                            </View>

                        </View>

                    </View>

{/* ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

                    {/* container de tarifa */}
                    <View className='m-5 mt-0 bg-white rounded-2xl h-[95px] shadow-md'>

                        {/* header */}
                        <View className=' p-4 rounded-t-2xl'>
                            <Banknote color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />
                        
                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Tarifa</Text>
                                <Text className='absolute right-0 color-customBlack font-semibold px-[10px]'>R$ 4,70</Text>
                            </View>

                        </View>
                        
                        {/* formas de pagamento */}
                        <View className=' p-4 pl-1 rounded-t-2xl border-t border-gray-200 flex-row '>

                            {/* RioCard */}
                            <View className='bg-[#D7E2EF] w-[95px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1 '>
                                <CreditCardIcon color='#1156EA' size={18} style={{ marginLeft: 5 }} />
                                <Text className='ml-2 text-sm font-semibold'>RioCard</Text>
                            </View>

                            {/* dinheiro*/}
                            <View className='bg-[#D5EBD7] w-[100px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1'>
                                <Banknote color='#038B0F' size={18} style={{ marginLeft: 5 }} />
                                <Text className='ml-2 text-sm font-semibold'>Dinheiro</Text>
                            </View>

                            {/* jae */}
                            <View className='bg-[#F1EAD4] w-[70px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1'>
                                <CreditCardIcon color='#EA790F' size={18} style={{ marginLeft: 5 }} />
                                <Text className='ml-2 text-sm font-semibold'>Jaé</Text>
                            </View>

                        </View>

                    </View>

{/* ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

                    {/* container de pontos de interesse */}
                    <Text className='m-5 mt-2 mb-4 font-semibold text-lg'>Pontos de Interesse </Text>

                    <View className='m-5 mt-0 bg-white rounded-2xl h-[240px] shadow-md'>

                        {/* ponto inter. 1 */}
                        <View className=' p-4'>
                            <ShoppingBag color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Park Shopping</Text>
                            </View>

                        </View>
                        
                        {/* ponto inter. 2 */}
                        <View className=' p-4 rounded-t-2xl border-t border-gray-200'>
                            <Train color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Estação de Trem Campo Grande</Text>
                            </View>

                        </View>

                        {/* ponto inter. 3 */}
                        <View className=' p-4 rounded-t-2xl border-t border-gray-200'>
                            <Bus color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>BRT Magarça</Text>
                            </View>

                        </View>

                        {/* ponto inter. 4 */}
                        <View className=' p-4 rounded-t-2xl border-t border-gray-200'>
                            <Hospital color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Hospital Qualquer </Text>
                            </View>

                        </View>

                        {/* ponto inter. 4 */}
                        <View className=' p-4 rounded-t-2xl border-t border-gray-200'>
                            <Medal color='#8E8E93' style={{ position: 'absolute', width: 20, height: 20, borderColor: '#ffffff', marginLeft: 18, marginTop: 12 }} />

                            <View>
                                <Text className='color-customBlack font-semibold px-[40px]'>Campo de Bangu</Text>
                            </View>

                        </View>

                    </View>

                    </View>
                    
                    )}
                </>
            )}
            />

        </View>
           
    )
}

export default linhas;