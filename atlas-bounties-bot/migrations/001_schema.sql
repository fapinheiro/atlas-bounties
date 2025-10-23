CREATE TABLE public.features (
    id integer NOT NULL,
    title character varying(50) NOT NULL,
    short_description character varying(100) NOT NULL,
    detailed_description character varying(500) NOT NULL,
    liquid_address text NOT NULL,
    depix_amount numeric(10,2) NULL,
    lbtc_amount numeric(10,2) NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    liquid_height integer NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE public.features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
	

ALTER SEQUENCE public.features_id_seq OWNED BY public.features.id;


ALTER TABLE ONLY public.features ALTER COLUMN id SET DEFAULT nextval('public.features_id_seq'::regclass);