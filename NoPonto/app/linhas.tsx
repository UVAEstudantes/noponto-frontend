import InputBusca from '@/src/components/inputBusca';
import Select from '@/src/components/select';
import SelectTransporte from '@/src/components/selectTransporte';
import { ArrowLeftRight, ArrowRightLeft, Bus, BusFront, ListFilter, LucideIcon, Train, TrainFrontTunnel } from 'lucide-react-native';
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

    { id: 1, modal: "onibus", nome: "232", sentido: "Lins ↔ Castelo" },
    { id: 2, modal: "onibus", nome: "238", sentido: "Marechal Hermes ↔ Castelo" },
    { id: 3, modal: "onibus", nome: "415", sentido: "Leblon ↔ Usina" },
    { id: 4, modal: "onibus", nome: "457", sentido: "Copacabana ↔ Abolição" },
    { id: 5, modal: "onibus", nome: "474", sentido: "Jacaré ↔ Jardim de Alah" },
    { id: 6, modal: "onibus", nome: "838", sentido: "Campo Grande ↔ Carioca" },
    { id: 7, modal: "onibus", nome: "855", sentido: "Bangu ↔ Candelária" },

    { id: 8, modal: "brt", nome: "10", sentido: "Santa Cruz ↔ Jardim Oceânico" },
    { id: 9, modal: "brt", nome: "12", sentido: "Terminal Alvorada ↔ Aeroporto Galeão" },
    { id: 10, modal: "brt", nome: "35", sentido: "Recreio ↔ Deodoro" },
    { id: 11, modal: "brt", nome: "38", sentido: "Deodoro ↔ Candelária" },

    { id: 12, modal: "trem", nome: "Ramal Deodoro", sentido: "Central do Brasil ↔ Deodoro" },
    { id: 13, modal: "trem", nome: "Ramal Santa Cruz", sentido: "Central do Brasil ↔ Santa Cruz" },
    { id: 14, modal: "trem", nome: "Ramal Japeri", sentido: "Central do Brasil ↔ Japeri" },
    { id: 15, modal: "trem", nome: "Ramal Saracuruna", sentido: "Central do Brasil ↔ Saracuruna" },

    { id: 16, modal: "metro", nome: "Linha 1", sentido: "Uruguai ↔ General Osório" },
    { id: 17, modal: "metro", nome: "Linha 2", sentido: "Pavuna ↔ Botafogo" },
    { id: 18, modal: "metro", nome: "Linha 4", sentido: "Jardim Oceânico ↔ General Osório" },
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
        setLinhaSelecionada(linha.sentido);
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

        return linhaSelecionada
        .split("↔")
        .map((s:string) => s.trim());
    };

    const buscaAtiva = busca !== "" && data.length > 0;

    return ( 

        <View className=" flex-1 bg-white"> 
        
            <MapView 
                style={{ position: 'absolute', top:0, left:0, right: 0, bottom: 0, zIndex:0 }}

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
                className='absolute rounded-3xl w-full h-[75%] bottom-0 bg-customGray z-10'
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
                    <View className='bg-customGray mt-5 pt-5 '>

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
                    
                    {/*container de resultado*/}
                    {linhaSelecionada && sentidoSelecionado && (
                    <View className='w-full mt-8 rounded-3xl'>
                    
                    <Text className='left-8 font-semibold'>Linha {busca} - {sentidoSelecionado}</Text>

                        <View className='bg-white m-8 p-5 rounded-2xl h-[120px] shadow-md'>

                        </View>
                        <View className='bg-black m-8 p-5 rounded-2xl h-[300px] shadow-md'>

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